package stt

import (
	"context"
	"fmt"
	"math/rand"
	"strings"
	"time"
)

// MockClient provides canned STT results for development.
// In production this would be replaced with Deepgram / Google STT / Whisper etc.
type MockClient struct{}

func NewMockClient() *MockClient {
	return &MockClient{}
}

func (m *MockClient) Transcribe(_ context.Context, audio []byte) (string, error) {
	// Simulate STT latency
	time.Sleep(time.Duration(200+rand.Intn(300)) * time.Millisecond)

	// Rough estimate: 16-bit mono 16kHz PCM is 32000 bytes/second
	durationSeconds := len(audio) / 32000
	if durationSeconds < 1 {
		durationSeconds = 1
	}

	sampleAnswers := []string{
		"I designed the system using a microservices architecture with event-driven communication through Kafka.",
		"The tradeoff I made was choosing eventual consistency so that question generation and scoring could run in parallel.",
		"We used PostgreSQL with careful indexing and query optimization, and introduced Redis caching for hot data paths.",
		"The main challenge was handling backpressure from downstream services. I implemented a bounded queue with a circuit breaker pattern.",
		"I'd improve it by adding better observability and a more robust retry mechanism with exponential backoff.",
		"For scalability, we horizontally partitioned the database and used connection pooling at the application layer.",
	}

	// Pick an answer roughly matching the duration
	idx := (durationSeconds - 1) % len(sampleAnswers)
	if idx >= len(sampleAnswers) {
		idx = len(sampleAnswers) - 1
	}
	text := sampleAnswers[idx]

	// Make it slightly longer for longer audio
	extra := durationSeconds / 3
	for i := 0; i < extra; i++ {
		text += " " + sampleAnswers[(idx+i+1)%len(sampleAnswers)]
	}

	return strings.TrimSpace(text), nil
}

func formatBytes(n int64) string {
	if n < 1024 {
		return fmt.Sprintf("%dB", n)
	}
	n /= 1024
	if n < 1024 {
		return fmt.Sprintf("%dKB", n)
	}
	n /= 1024
	return fmt.Sprintf("%dMB", n)
}
