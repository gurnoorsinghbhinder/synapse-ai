package stt

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// Client is the speech-to-text interface.
// Implementations can wrap real STT APIs (Google, Deepgram, Whisper, etc.)
// or provide mock results for development.
type Client interface {
	Transcribe(ctx context.Context, audio []byte) (string, error)
}

// WhisperClient talks to a local/open Whisper-compatible HTTP server.
// Example env vars:
//
//	WHISPER_BASE_URL=http://localhost:8000
//	WHISPER_API_KEY=optional
type WhisperClient struct {
	baseURL string
	apiKey  string
	httpCli *http.Client
}

func NewWhisperClient() *WhisperClient {
	baseURL := os.Getenv("WHISPER_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8000"
	}
	return &WhisperClient{
		baseURL: baseURL,
		apiKey:  os.Getenv("WHISPER_API_KEY"),
		httpCli: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *WhisperClient) Transcribe(ctx context.Context, audio []byte) (string, error) {
	if audio == nil || len(audio) == 0 {
		return "", fmt.Errorf("empty audio")
	}

	url := fmt.Sprintf("%s/v1/audio/transcriptions", c.baseURL)

	// Prefer multipart form with file field "file"
	boundary := "whisper-boundary"
	body := &bytes.Buffer{}
	body.WriteString("--" + boundary + "\r\n")
	body.WriteString(`Content-Disposition: form-data; name="file"; filename="audio.wav"` + "\r\n")
	body.WriteString("Content-Type: application/octet-stream\r\n\r\n")
	body.Write(audio)
	body.WriteString("\r\n--" + boundary + "--\r\n")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "multipart/form-data; boundary="+boundary)
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
