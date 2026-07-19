package storage

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client interface {
	Upload(ctx context.Context, path string, data []byte) (string, error)
	DeleteFolder(ctx context.Context, interviewID string) error
}

type SupabaseClient struct {
	baseURL string
	key     string
	bucket  string
	httpCli *http.Client
}

func NewSupabaseClient(url, key, bucket string) *SupabaseClient {
	url = strings.TrimSuffix(url, "/")
	return &SupabaseClient{
		baseURL: url,
		key:     key,
		bucket:  bucket,
		httpCli: &http.Client{Timeout: 15 * time.Second},
	}
}

type MockStorageClient struct{}

func NewMockStorageClient() *MockStorageClient {
	return &MockStorageClient{}
}

func (m *MockStorageClient) Upload(ctx context.Context, path string, data []byte) (string, error) {
	return fmt.Sprintf("http://localhost:8080/mock-audio/%s", path), nil
}

func (m *MockStorageClient) DeleteFolder(ctx context.Context, folderPrefix string) error {
	return nil
}

// Upload uploads binary data to Supabase Storage and returns the public URL.
func (s *SupabaseClient) Upload(ctx context.Context, path string, data []byte) (string, error) {
	url := fmt.Sprintf("%s/storage/v1/object/%s/%s", s.baseURL, s.bucket, path)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("storage/supabase: create upload request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.key)
	req.Header.Set("Content-Type", "audio/wav")

	resp, err := s.httpCli.Do(req)
	if err != nil {
		return "", fmt.Errorf("storage/supabase: upload request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("storage/supabase: upload failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Construct public URL
	publicURL := fmt.Sprintf("%s/storage/v1/object/public/%s/%s", s.baseURL, s.bucket, path)
	return publicURL, nil
}

// DeleteFolder lists all objects with the folder prefix and deletes them.
func (s *SupabaseClient) DeleteFolder(ctx context.Context, folderPrefix string) error {
	// 1. List all files under prefix
	listURL := fmt.Sprintf("%s/storage/v1/object/list/%s", s.baseURL, s.bucket)
	
	listBody := map[string]any{
		"prefix": folderPrefix,
		"limit":  100,
	}
	payload, err := json.Marshal(listBody)
	if err != nil {
		return fmt.Errorf("storage/supabase: marshal list request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, listURL, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("storage/supabase: create list request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+s.key)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpCli.Do(req)
	if err != nil {
		return fmt.Errorf("storage/supabase: list request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("storage/supabase: list files failed with status %d: %s", resp.StatusCode, string(body))
	}

	var files []struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&files); err != nil {
		return fmt.Errorf("storage/supabase: decode list files: %w", err)
	}

	if len(files) == 0 {
		return nil // Nothing to delete
	}

	// 2. Delete found files in bulk
	prefixes := make([]string, len(files))
	for i, f := range files {
		prefixes[i] = fmt.Sprintf("%s/%s", folderPrefix, f.Name)
	}

	deleteURL := fmt.Sprintf("%s/storage/v1/object/%s", s.baseURL, s.bucket)
	deleteBody := map[string]any{
		"prefixes": prefixes,
	}
	delPayload, err := json.Marshal(deleteBody)
	if err != nil {
		return fmt.Errorf("storage/supabase: marshal delete request: %w", err)
	}

	delReq, err := http.NewRequestWithContext(ctx, http.MethodDelete, deleteURL, bytes.NewReader(delPayload))
	if err != nil {
		return fmt.Errorf("storage/supabase: create delete request: %w", err)
	}

	delReq.Header.Set("Authorization", "Bearer "+s.key)
	delReq.Header.Set("Content-Type", "application/json")

	delResp, err := s.httpCli.Do(delReq)
	if err != nil {
		return fmt.Errorf("storage/supabase: delete request: %w", err)
	}
	defer delResp.Body.Close()

	if delResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(delResp.Body)
		return fmt.Errorf("storage/supabase: delete failed with status %d: %s", delResp.StatusCode, string(body))
	}

	return nil
}
