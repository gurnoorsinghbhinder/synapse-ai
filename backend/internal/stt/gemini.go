package stt

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"time"
)

// GeminiSTTClient transcribes audio using Google Gemini's multimodal API.
// Gemini has native audio understanding and can transcribe speech with high accuracy.
//
// It sends a short request to Gemini with the audio embedded as base64-encoded
// data, asking it to transcribe the speech. It supports common audio formats
// including webm+opus (from MediaRecorder), wav, and mp3.
type GeminiSTTClient struct {
	apiKey  string
	model   string
	httpCli *http.Client
}

func NewGeminiSTTClient() *GeminiSTTClient {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("GOOGLE_API_KEY")
	}
	model := os.Getenv("GEMINI_STT_MODEL")
	if model == "" {
		model = "gemini-2.0-flash" // required: flash-lite does NOT support audio
	}
	return &GeminiSTTClient{
		apiKey:  apiKey,
		model:   model,
		httpCli: &http.Client{Timeout: 30 * time.Second},
	}
}

// Transcribe sends audio bytes to Gemini for transcription.
// It auto-detects the MIME type based on common magic bytes.
func (c *GeminiSTTClient) Transcribe(ctx context.Context, audio []byte) (string, error) {
	if len(audio) == 0 {
		return "", fmt.Errorf("empty audio")
	}

	// Ensure audio has a proper container format (wrap raw PCM in WAV)
	wrappedAudio, mimeType := ensureWAV(audio)
	b64Data := base64.StdEncoding.EncodeToString(wrappedAudio)

	prompt := "Transcribe the speech in this audio accurately. Return ONLY the transcribed text, nothing else. If there is no speech, return an empty string."

	requestBody := map[string]any{
		"contents": []map[string]any{
			{
				"parts": []map[string]any{
					{
						"inlineData": map[string]any{
							"mimeType": mimeType,
							"data":     b64Data,
						},
					},
					{
						"text": prompt,
					},
				},
			},
		},
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", c.model, c.apiKey)

	body, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpCli.Do(req)
	if err != nil {
		return "", fmt.Errorf("gemini request failed: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("gemini status %d: %s", resp.StatusCode, string(raw))
	}

	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		PromptFeedback struct {
			BlockReason string `json:"blockReason"`
		} `json:"promptFeedback"`
	}

	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("failed to parse gemini response: %w", err)
	}

	if result.PromptFeedback.BlockReason != "" {
		return "", fmt.Errorf("gemini blocked request: %s", result.PromptFeedback.BlockReason)
	}

	if len(result.Candidates) == 0 {
		return "", nil
	}

	text := ""
	for _, part := range result.Candidates[0].Content.Parts {
		text += part.Text
	}

	return strings.TrimSpace(text), nil
}

// ensureWAV checks if the data is raw PCM (no header) and wraps it in a WAV container.
// Raw PCM 16-bit mono at 16kHz is what the frontend sends.
// Gemini and most STT APIs require a proper container format.
func ensureWAV(data []byte) ([]byte, string) {
	if len(data) < 4 {
		// Too small to have a header — treat as raw PCM and wrap in WAV
		return wrapPCMAsWAV(data, 16000), "audio/wav"
	}

	magic := uint32(data[0]) | uint32(data[1])<<8 | uint32(data[2])<<16 | uint32(data[3])<<24

	// Already has a proper container header
	switch {
	case magic == 0x1A45DFA3: // WebM / Matroska
		return data, "audio/webm"
	case data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x46: // RIFF
		return data, "audio/wav"
	case data[0] == 0x49 && data[1] == 0x44 && data[2] == 0x33: // MP3
		return data, "audio/mp3"
	case data[0] == 0x4F && data[1] == 0x67 && data[2] == 0x67 && data[3] == 0x53: // Ogg
		return data, "audio/ogg"
	case data[0] == 0x66 && data[1] == 0x4C && data[2] == 0x61 && data[3] == 0x43: // FLAC
		return data, "audio/flac"
	}

	// No known header — treat as raw PCM and wrap in WAV
	return wrapPCMAsWAV(data, 16000), "audio/wav"
}

// wrapPCMAsWAV creates a proper WAV container around raw PCM 16-bit mono audio.
// sampleRate is the expected sample rate (default 16000 for our pipeline).
func wrapPCMAsWAV(pcmData []byte, sampleRate int) []byte {
	if len(pcmData) == 0 {
		return pcmData
	}
	if sampleRate <= 0 {
		sampleRate = 16000
	}

	bytesPerSample := 2 // 16-bit
	numChannels := 1    // mono
	byteRate := sampleRate * bytesPerSample * numChannels
	blockAlign := bytesPerSample * numChannels
	dataSize := len(pcmData)
	fileSize := 36 + dataSize

	wav := make([]byte, 44+dataSize)

	// RIFF header
	copy(wav[0:4], "RIFF")
	wav[4] = byte(fileSize)
	wav[5] = byte(fileSize >> 8)
	wav[6] = byte(fileSize >> 16)
	wav[7] = byte(fileSize >> 24)
	copy(wav[8:12], "WAVE")

	// fmt subchunk
	copy(wav[12:16], "fmt ")
	wav[16] = 16 // subchunk size (16 for PCM)
	wav[17] = 0
	wav[18] = 0
	wav[19] = 0
	wav[20] = 1 // audio format (1 = PCM)
	wav[21] = 0
	wav[22] = byte(numChannels) // num channels
	wav[23] = 0
	wav[24] = byte(sampleRate)
	wav[25] = byte(sampleRate >> 8)
	wav[26] = byte(sampleRate >> 16)
	wav[27] = byte(sampleRate >> 24)
	wav[28] = byte(byteRate)
	wav[29] = byte(byteRate >> 8)
	wav[30] = byte(byteRate >> 16)
	wav[31] = byte(byteRate >> 24)
	wav[32] = byte(blockAlign)
	wav[33] = 0
	wav[34] = byte(bytesPerSample * 8) // bits per sample
	wav[35] = 0

	// data subchunk
	copy(wav[36:40], "data")
	wav[40] = byte(dataSize)
	wav[41] = byte(dataSize >> 8)
	wav[42] = byte(dataSize >> 16)
	wav[43] = byte(dataSize >> 24)

	// PCM data
	copy(wav[44:], pcmData)

	return wav
}

// detectMIMEType checks magic bytes to determine audio format.
func detectMIMEType(data []byte) string {
	if len(data) < 4 {
		return "audio/wav"
	}

	// WAV / RIFF
	if data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x46 {
		return "audio/wav"
	}
	// WebM / Matroska
	if data[0] == 0x1A && data[1] == 0x45 && data[2] == 0xDF && data[3] == 0xA3 {
		return "audio/webm"
	}
	// MP3 ID3 tag
	if data[0] == 0x49 && data[1] == 0x44 && data[2] == 0x33 {
		return "audio/mp3"
	}
	// Ogg (could be Opus, Vorbis, etc)
	if data[0] == 0x4F && data[1] == 0x67 && data[2] == 0x67 && data[3] == 0x53 {
		return "audio/ogg"
	}
	// FLAC
	if data[0] == 0x66 && data[1] == 0x4C && data[2] == 0x61 && data[3] == 0x43 {
		return "audio/flac"
	}

	return "audio/wav"
}

// MultipartWhisperClient is identical to WhisperClient but uses multipart form
// for whisper.cpp or OpenAI-compatible transcription endpoints.
type MultipartWhisperClient struct {
	baseURL string
	apiKey  string
	model   string
	httpCli *http.Client
}

func NewMultipartWhisperClient() *MultipartWhisperClient {
	baseURL := os.Getenv("WHISPER_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8000"
	}
	model := os.Getenv("WHISPER_MODEL")
	if model == "" {
		model = "base"
	}
	return &MultipartWhisperClient{
		baseURL: baseURL,
		apiKey:  os.Getenv("WHISPER_API_KEY"),
		model:   model,
		httpCli: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *MultipartWhisperClient) Transcribe(ctx context.Context, audio []byte) (string, error) {
	if len(audio) == 0 {
		return "", fmt.Errorf("empty audio")
	}

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	// Write audio file part
	fw, err := w.CreateFormFile("file", "audio.webm")
	if err != nil {
		return "", err
	}
	if _, err := fw.Write(audio); err != nil {
		return "", err
	}

	// Write model part
	if err := w.WriteField("model", c.model); err != nil {
		return "", err
	}

	w.Close()

	url := fmt.Sprintf("%s/v1/audio/transcriptions", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpCli.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("whisper status %d: %s", resp.StatusCode, string(raw))
	}

	var out struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", err
	}
	return out.Text, nil
}
