package stt

import "context"

// Client is the speech-to-text interface.
// Implementations can wrap real STT APIs (Google, Deepgram, Whisper, etc.)
// or provide mock results for development.
type Client interface {
	// Transcribe sends raw PCM audio (16-bit mono, 16000 Hz) and returns
	// the transcribed text. The audio slice contains all accumulated speech
	// between silence boundaries.
	Transcribe(ctx context.Context, audio []byte) (string, error)
}
