package storage

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSupabaseClient_Upload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("expected POST request, got %s", r.Method)
		}
		if !strings.HasSuffix(r.URL.Path, "/object/test-bucket/int_123/q_1.wav") {
			t.Errorf("unexpected upload URL path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("unexpected Authorization header: %s", r.Header.Get("Authorization"))
		}
		if r.Header.Get("Content-Type") != "audio/wav" {
			t.Errorf("unexpected Content-Type header: %s", r.Header.Get("Content-Type"))
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"Key": "test-bucket/int_123/q_1.wav"}`))
	}))
	defer server.Close()

	client := NewSupabaseClient(server.URL, "test-key", "test-bucket")
	url, err := client.Upload(context.Background(), "int_123/q_1.wav", []byte("wav-data"))
	if err != nil {
		t.Fatalf("unexpected upload error: %v", err)
	}

	expectedURL := server.URL + "/storage/v1/object/public/test-bucket/int_123/q_1.wav"
	if url != expectedURL {
		t.Errorf("got public URL %q, want %q", url, expectedURL)
	}
}

func TestSupabaseClient_DeleteFolder(t *testing.T) {
	var listCalled, deleteCalled bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Handle file listing
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/object/list/test-bucket") {
			listCalled = true
			var body struct {
				Prefix string `json:"prefix"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body.Prefix != "int_123" {
				t.Errorf("expected list prefix 'int_123', got %q", body.Prefix)
			}

			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`[{"name": "q_1.wav"}, {"name": "q_2.wav"}]`))
			return
		}

		// Handle file deletion
		if r.Method == http.MethodDelete && strings.HasSuffix(r.URL.Path, "/object/test-bucket") {
			deleteCalled = true
			var body struct {
				Prefixes []string `json:"prefixes"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			if len(body.Prefixes) != 2 || body.Prefixes[0] != "int_123/q_1.wav" || body.Prefixes[1] != "int_123/q_2.wav" {
				t.Errorf("unexpected prefixes deleted: %v", body.Prefixes)
			}

			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status": "deleted"}`))
			return
		}

		t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
	}))
	defer server.Close()

	client := NewSupabaseClient(server.URL, "test-key", "test-bucket")
	err := client.DeleteFolder(context.Background(), "int_123")
	if err != nil {
		t.Fatalf("unexpected DeleteFolder error: %v", err)
	}

	if !listCalled {
		t.Error("expected list files endpoint to be called")
	}
	if !deleteCalled {
		t.Error("expected delete files endpoint to be called")
	}
}
