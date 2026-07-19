package tts

import "context"

// Client is the text-to-speech interface.
// Implementations can wrap real TTS APIs (Google, ElevenLabs, OpenAI, etc.)
// or provide mock results for development.
type Client interface {
	// Synthesize converts text to audio and returns the raw audio bytes.
	// The audio format is WAV (16-bit mono, 24000 Hz) for browser compatibility.
	Synthesize(ctx context.Context, text string) ([]byte, error)
}
