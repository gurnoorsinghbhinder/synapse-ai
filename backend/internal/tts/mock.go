package tts

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"time"
)

// MockClient generates a synthetic WAV tone for development.
// In production this would be replaced with ElevenLabs / Google TTS / OpenAI TTS.
type MockClient struct{}

func NewMockClient() *MockClient {
	return &MockClient{}
}

// Synthesize generates a WAV file with a synthetic voice-like tone.
// The audio is a modulated sine wave that mimics speech cadence.
func (m *MockClient) Synthesize(_ context.Context, text string) ([]byte, error) {
	// Simulate TTS generation latency
	time.Sleep(300 * time.Millisecond)

	// Estimate duration: ~150ms per character, min 1s, max 15s
	wordCount := len(text)
	duration := time.Duration(wordCount) * 150 * time.Millisecond
	if duration < 1*time.Second {
		duration = 1 * time.Second
	}
	if duration > 15*time.Second {
		duration = 15 * time.Second
	}

	return generateWAV(duration), nil
}

// generateWAV creates a PCM WAV file with a modulated tone.
// Sample rate: 24000 Hz, 16-bit mono.
func generateWAV(duration time.Duration) []byte {
	sampleRate := 24000
	numSamples := int(duration.Seconds() * float64(sampleRate))

	var buf bytes.Buffer

	// WAV header
	writeString(&buf, "RIFF")
	writeUint32(&buf, uint32(36+numSamples*2)) // file size - 8
	writeString(&buf, "WAVE")
	writeString(&buf, "fmt ")
	writeUint32(&buf, 16) // chunk size
	writeUint16(&buf, 1)  // PCM format
	writeUint16(&buf, 1)  // mono
	writeUint32(&buf, uint32(sampleRate))
	writeUint32(&buf, uint32(sampleRate*2)) // byte rate
	writeUint16(&buf, 2)                    // block align
	writeUint16(&buf, 16)                   // bits per sample
	writeString(&buf, "data")
	writeUint32(&buf, uint32(numSamples*2))

	// Generate a speech-like modulated tone
	// Uses a base frequency that varies like a voice, with harmonics
	for i := 0; i < numSamples; i++ {
		t := float64(i) / float64(sampleRate)

		// Base frequency: oscillates between 120-200 Hz (typical male speech range)
		baseFreq := 160.0 + 40.0*math.Sin(2*math.Pi*0.3*t)
		// Formant-like harmonics
		sample := 0.5*math.Sin(2*math.Pi*baseFreq*t) +
			0.25*math.Sin(2*math.Pi*baseFreq*2.3*t) +
			0.125*math.Sin(2*math.Pi*baseFreq*3.7*t) +
			0.0625*math.Sin(2*math.Pi*baseFreq*5.1*t)

		// Amplitude envelope: fade in/out and add syllable-like modulation
		envelope := 0.8 - 0.2*math.Cos(2*math.Pi*4.0*t)
		sample *= envelope

		// Clamp and convert to int16
		sample = math.Max(-1.0, math.Min(1.0, sample))
		value := int16(sample * 32767)

		_ = binary.Write(&buf, binary.LittleEndian, value)
	}

	return buf.Bytes()
}

func writeString(buf *bytes.Buffer, s string) {
	buf.WriteString(s)
}

func writeUint32(buf *bytes.Buffer, v uint32) {
	_ = binary.Write(buf, binary.LittleEndian, v)
}

func writeUint16(buf *bytes.Buffer, v uint16) {
	_ = binary.Write(buf, binary.LittleEndian, v)
}

// FormatDuration returns a human-readable string for the byte size of a WAV.
func FormatWAVSize(data []byte) string {
	return fmt.Sprintf("%.1fKB", float64(len(data))/1024)
}
