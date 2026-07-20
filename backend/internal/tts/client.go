package tts

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

// Client is the text-to-speech interface.
// Implementations can wrap real TTS APIs (Google, ElevenLabs, OpenAI, etc.)
// or provide mock results for development.
type Client interface {
	Synthesize(ctx context.Context, text string) ([]byte, error)
}

// PiperClient talks to a local/open Piper TTS HTTP server.
// Piper typically serves WAV output.
//
// Env:
//
//	PIPER_BASE_URL=http://localhost:5002
//	PIPER_VOICE=optional voice/model name if required by your deployment
type PiperClient struct {
	baseURL string
	voice   string
	httpCli *http.Client
}

func NewPiperClient() *PiperClient {
	baseURL := os.Getenv("PIPER_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:5002"
	}
	return &PiperClient{
		baseURL: baseURL,
		voice:   os.Getenv("PIPER_VOICE"),
		httpCli: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *PiperClient) Synthesize(ctx context.Context, text string) ([]byte, error) {
	if text == "" {
		return nil, fmt.Errorf("empty text")
	}

	url := fmt.Sprintf("%s/synthesize", c.baseURL)
	payload := map[string]any{"text": text}
	if c.voice != "" {
		payload["voice"] = c.voice
	}
	b, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpCli.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("piper status %d: %s", resp.StatusCode, string(raw))
	}
	if len(raw) == 0 {
		return nil, fmt.Errorf("piper returned empty audio")
	}
	return raw, nil
}
