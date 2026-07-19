package ai

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	// Mock timeSleep to speed up tests
	originalSleep := timeSleep
	timeSleep = func(d time.Duration) {}
	code := m.Run()
	timeSleep = originalSleep
	os.Exit(code)
}

func TestGeminiClient_GenerateSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		resp := geminiResponse{
			Candidates: []geminiCandidate{
				{
					Content: geminiContent{
						Parts: []geminiPart{
							{Text: "Test response question?"},
						},
					},
				},
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := &GeminiClient{
		apiKey:  "test-key",
		model:   "gemini-2.5-flash",
		baseURL: server.URL,
		httpCli: server.Client(),
	}

	res, err := client.GenerateQuestion(QuestionRequest{
		Role: "Software Engineer",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res != "Test response question?" {
		t.Errorf("got %q, want %q", res, "Test response question?")
	}
}

func TestGeminiClient_RetryOnTransientErrors(t *testing.T) {
	var attempts int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		curr := atomic.AddInt32(&attempts, 1)
		w.Header().Set("Content-Type", "application/json")

		if curr < 3 {
			w.WriteHeader(http.StatusTooManyRequests)
			resp := geminiResponse{
				Error: &geminiError{
					Message: "Rate limit exceeded",
				},
			}
			_ = json.NewEncoder(w).Encode(resp)
			return
		}

		w.WriteHeader(http.StatusOK)
		resp := geminiResponse{
			Candidates: []geminiCandidate{
				{
					Content: geminiContent{
						Parts: []geminiPart{
							{Text: "Succeeded after retry"},
						},
					},
				},
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := &GeminiClient{
		apiKey:  "test-key",
		model:   "gemini-2.5-flash",
		baseURL: server.URL,
		httpCli: server.Client(),
	}

	res, err := client.generate("hello")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res != "Succeeded after retry" {
		t.Errorf("got %q, want %q", res, "Succeeded after retry")
	}

	finalAttempts := atomic.LoadInt32(&attempts)
	if finalAttempts != 3 {
		t.Errorf("expected 3 attempts, got %d", finalAttempts)
	}
}

func TestGeminiClient_ImmediateFailOnBadRequest(t *testing.T) {
	var attempts int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		resp := geminiResponse{
			Error: &geminiError{
				Message: "Invalid request payload",
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := &GeminiClient{
		apiKey:  "test-key",
		model:   "gemini-2.5-flash",
		baseURL: server.URL,
		httpCli: server.Client(),
	}

	_, err := client.generate("hello")
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "Invalid request payload") {
		t.Errorf("expected error message to contain payload error, got: %v", err)
	}

	finalAttempts := atomic.LoadInt32(&attempts)
	if finalAttempts != 1 {
		t.Errorf("expected immediate failure (1 attempt), got %d", finalAttempts)
	}
}

func TestGeminiClient_MaxRetriesExceeded(t *testing.T) {
	var attempts int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		resp := geminiResponse{
			Error: &geminiError{
				Message: "Service Unavailable",
			},
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := &GeminiClient{
		apiKey:  "test-key",
		model:   "gemini-2.5-flash",
		baseURL: server.URL,
		httpCli: server.Client(),
	}

	_, err := client.generate("hello")
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "failed after 3 retries") {
		t.Errorf("expected error message to mention retries limit, got: %v", err)
	}

	finalAttempts := atomic.LoadInt32(&attempts)
	if finalAttempts != 4 { // 1 initial + 3 retries
		t.Errorf("expected 4 attempts total, got %d", finalAttempts)
	}
}
