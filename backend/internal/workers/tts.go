package workers

import (
	"context"
	"encoding/json"
	"fmt"

	"intervue/backend/internal/eventbus"
	"intervue/backend/internal/storage"
	"intervue/backend/internal/tts"
	"intervue/backend/shared/events"
)

// startTTSWorker subscribes to QuestionAsked events, generates TTS audio,
// and publishes AudioQueued → AudioReady events.
//
// Flow:
//  1. QuestionAsked event is published by the orchestrator
//  2. TTS worker picks it up, extracts the question text
//  3. Publishes AudioQueued (audio is being generated)
//  4. Calls tts.Client.Synthesize() to generate WAV audio
//  5. Publishes AudioReady with the audio payload as base64
//  6. Frontend receives AudioReady and plays the audio
func startTTSWorker(ctx context.Context, bus eventbus.Bus, ttsClient tts.Client, storageClient storage.Client) {
	ch := bus.Subscribe(ctx, "tts-worker", events.InterviewTopic)
	go func() {
		for event := range ch {
			if event.Type != events.QuestionAsked {
				continue
			}

			var payload struct {
				Question       string `json:"question"`
				QuestionNumber int    `json:"question_number"`
			}
			if err := json.Unmarshal(event.Payload, &payload); err != nil {
				continue
			}
			if payload.Question == "" {
				continue
			}

			// 1. Publish AudioQueued — generation has started
			bus.Publish(ctx, events.New(events.AudioTopic, event.InterviewID, events.AudioQueued, map[string]any{
				"question":        payload.Question,
				"question_number": payload.QuestionNumber,
				"status":          "generating",
			}))

			// 2. Generate TTS audio
			audioData, err := ttsClient.Synthesize(ctx, payload.Question)
			if err != nil {
				bus.Publish(ctx, events.New(events.AudioTopic, event.InterviewID, events.AudioQueued, map[string]any{
					"question":        payload.Question,
					"question_number": payload.QuestionNumber,
					"status":          "error",
					"error":           err.Error(),
				}))
				continue
			}

			// 3. Upload to Supabase Storage
			filename := fmt.Sprintf("%s/q_%d.wav", event.InterviewID, payload.QuestionNumber)
			audioURL, err := storageClient.Upload(ctx, filename, audioData)
			if err != nil {
				bus.Publish(ctx, events.New(events.AudioTopic, event.InterviewID, events.AudioQueued, map[string]any{
					"question":        payload.Question,
					"question_number": payload.QuestionNumber,
					"status":          "error",
					"error":           fmt.Sprintf("storage upload: %v", err),
				}))
				continue
			}

			// 4. Publish AudioReady with the public URL
			bus.Publish(ctx, events.New(events.AudioTopic, event.InterviewID, events.AudioReady, map[string]any{
				"question":        payload.Question,
				"question_number": payload.QuestionNumber,
				"audio_url":       audioURL,
				"format":          "wav",
				"sample_rate":     24000,
				"channels":        1,
				"bits_per_sample": 16,
				"size_bytes":      len(audioData),
			}))
		}
	}()
}
