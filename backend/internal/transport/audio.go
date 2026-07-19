package transport

import (
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"intervue/backend/internal/eventbus"
	"intervue/backend/internal/orchestrator"
	"intervue/backend/internal/stt"
	"intervue/backend/shared/events"
)

// AudioWebSocketHub handles the WS /interview/:id/audio endpoint.
//
// Flow:
//  1. Frontend opens a WebSocket to /interview/:id/audio
//  2. Frontend streams raw PCM audio chunks (16-bit mono 16kHz)
//  3. Backend accumulates chunks and detects silence
//  4. On silence detection, accumulated audio is sent to STT
//  5. STT result is published as TranscriptChunk events
//  6. When silence exceeds the completion threshold, TranscriptCompleted is emitted
//  7. The orchestrator/worker loop picks up from there
type AudioWebSocketHub struct {
	bus  eventbus.Bus
	orch *orchestrator.Orchestrator
	stt  stt.Client
}

// SilenceDetectorConfig controls when we consider speech to have ended.
type SilenceDetectorConfig struct {
	// ChunkTimeout is how long we wait after receiving a chunk before
	// considering the user might have paused (triggers interim STT).
	ChunkTimeout time.Duration

	// CompletionTimeout is how long of continuous silence before we
	// consider the utterance complete and emit TranscriptCompleted.
	CompletionTimeout time.Duration

	// MaxUtteranceDuration is the maximum length of a single utterance.
	// If exceeded, we force-complete the utterance.
	MaxUtteranceDuration time.Duration
}

// DefaultSilenceDetectorConfig returns sensible defaults.
// The completion timeout is deliberately generous (3s) to avoid
// cutting off candidates who pause to think mid-answer.
func DefaultSilenceDetectorConfig() SilenceDetectorConfig {
	return SilenceDetectorConfig{
		ChunkTimeout:         800 * time.Millisecond,
		CompletionTimeout:    3 * time.Second,
		MaxUtteranceDuration: 120 * time.Second,
	}
}

// audioSession tracks a single audio WebSocket connection.
type audioSession struct {
	hub         *AudioWebSocketHub
	interviewID string
	conn        net.Conn
	rw          *bufio.ReadWriter

	// Audio accumulation
	mu             sync.Mutex
	buffer         []byte
	utteranceStart time.Time
	lastAudioAt    time.Time
	completed      bool

	// Config
	cfg SilenceDetectorConfig

	// Logger
	log *slog.Logger
}

func NewAudioWebSocketHub(bus eventbus.Bus, orch *orchestrator.Orchestrator, sttClient stt.Client) *AudioWebSocketHub {
	return &AudioWebSocketHub{
		bus:  bus,
		orch: orch,
		stt:  sttClient,
	}
}

// ServeHTTP handles the WebSocket upgrade and session lifecycle.
// URL pattern: /interview/{id}/audio
func (h *AudioWebSocketHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	interviewID := r.PathValue("id")
	if interviewID == "" {
		http.Error(w, "interview id is required", http.StatusBadRequest)
		return
	}

	conn, rw, err := upgrade(w, r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	log := slog.With("interview_id", interviewID, "remote", conn.RemoteAddr())
	log.Info("audio WebSocket connected")

	session := &audioSession{
		hub:            h,
		interviewID:    interviewID,
		conn:           conn,
		rw:             rw,
		buffer:         make([]byte, 0, 256*1024), // pre-allocate 256KB
		utteranceStart: time.Now(),
		lastAudioAt:    time.Now(),
		cfg:            DefaultSilenceDetectorConfig(),
		log:            log,
	}

	// Send a connected acknowledgment
	_ = session.writeJSON(map[string]any{
		"type":    "AudioConnected",
		"message": "Audio streaming ready. Send raw PCM 16-bit mono 16kHz chunks.",
	})

	// Start the silence monitor goroutine
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	go session.silenceMonitor(ctx)

	// Read audio chunks from the WebSocket
	session.readLoop(ctx)
}

// readLoop reads binary frames from the WebSocket and accumulates audio.
func (s *audioSession) readLoop(ctx context.Context) {
	defer func() {
		s.mu.Lock()
		s.completed = true
		s.mu.Unlock()
		s.conn.Close()
		s.log.Info("audio WebSocket disconnected")
	}()

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		frame, err := s.readFrame()
		if err != nil {
			if errors.Is(err, net.ErrClosed) || errors.Is(err, io.EOF) {
				return
			}
			// Check for close frame
			if isCloseFrame(frame) {
				s.log.Debug("received close frame")
				return
			}
			s.log.Debug("read error (non-fatal)", "error", err)
			continue
		}

		// Handle text frames as control messages
		if frame.opcode == 0x1 {
			s.handleControlMessage(frame.payload)
			continue
		}

		// Binary frame = audio data
		if frame.opcode != 0x2 {
			continue
		}

		s.mu.Lock()
		s.buffer = append(s.buffer, frame.payload...)
		s.lastAudioAt = time.Now()
		if s.utteranceStart.IsZero() {
			s.utteranceStart = time.Now()
		}
		s.mu.Unlock()
	}
}

// handleControlMessage processes JSON control messages from the frontend.
// Supported messages:
//   - {"type": "force_complete"} — manually signal that the user has finished speaking
//   - {"type": "set_config", "completion_timeout_ms": 5000} — adjust silence threshold
func (s *audioSession) handleControlMessage(payload []byte) {
	var msg struct {
		Type                string `json:"type"`
		CompletionTimeoutMs int    `json:"completion_timeout_ms,omitempty"`
	}
	if err := json.Unmarshal(payload, &msg); err != nil {
		return
	}

	switch msg.Type {
	case "force_complete":
		s.log.Info("force complete requested by client")
		s.finalizeUtterance()
	case "set_config":
		if msg.CompletionTimeoutMs > 0 {
			s.mu.Lock()
			s.cfg.CompletionTimeout = time.Duration(msg.CompletionTimeoutMs) * time.Millisecond
			s.mu.Unlock()
			s.log.Info("silence threshold updated", "timeout", s.cfg.CompletionTimeout)
		}
	}
}

// silenceMonitor runs in a goroutine and checks for silence periodically.
// When silence exceeds the chunk timeout, it sends interim results to STT.
// When silence exceeds the completion timeout, it finalizes the utterance.
func (s *audioSession) silenceMonitor(ctx context.Context) {
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		s.mu.Lock()
		if s.completed || len(s.buffer) == 0 {
			s.mu.Unlock()
			continue
		}

		silenceDuration := time.Since(s.lastAudioAt)
		utteranceDuration := time.Since(s.utteranceStart)
		bufLen := len(s.buffer)
		s.mu.Unlock()

		// Check for max utterance duration
		if utteranceDuration >= s.cfg.MaxUtteranceDuration {
			s.log.Info("max utterance duration reached, force-completing",
				"duration", utteranceDuration)
			s.finalizeUtterance()
			continue
		}

		// Check for completion silence threshold
		if silenceDuration >= s.cfg.CompletionTimeout {
			s.log.Info("silence completion threshold reached",
				"silence_duration", silenceDuration,
				"audio_bytes", bufLen)
			s.finalizeUtterance()
			continue
		}

		// Check for interim chunk threshold
		if silenceDuration >= s.cfg.ChunkTimeout && bufLen > 32000 { // at least ~1s of audio
			s.processInterimChunk()
		}
	}
}

// processInterimChunk sends accumulated audio to STT and publishes a TranscriptChunk event.
// This gives the frontend near-real-time transcription feedback.
func (s *audioSession) processInterimChunk() {
	s.mu.Lock()
	if len(s.buffer) == 0 {
		s.mu.Unlock()
		return
	}
	audio := make([]byte, len(s.buffer))
	copy(audio, s.buffer)
	s.mu.Unlock()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		text, err := s.hub.stt.Transcribe(ctx, audio)
		if err != nil {
			s.log.Warn("interim STT failed", "error", err)
			return
		}
		if text == "" {
			return
		}

		s.log.Debug("interim transcript", "text", text[:min(len(text), 80)])

		event := events.New(events.TranscriptTopic, s.interviewID, events.TranscriptChunk, map[string]any{
			"text":   text,
			"final":  false,
			"offset": len(audio),
		})
		s.hub.bus.Publish(ctx, event)
	}()
}

// finalizeUtterance sends the accumulated audio to STT, publishes
// TranscriptChunk (final=true) and TranscriptCompleted events,
// then hands off to the orchestrator.
func (s *audioSession) finalizeUtterance() {
	s.mu.Lock()
	if s.completed {
		s.mu.Unlock()
		return
	}
	s.completed = true
	audio := s.buffer
	s.buffer = nil
	s.mu.Unlock()

	if len(audio) == 0 {
		s.log.Debug("finalize called with empty buffer, skipping")
		// Reset for next utterance
		s.mu.Lock()
		s.completed = false
		s.buffer = make([]byte, 0, 256*1024)
		s.utteranceStart = time.Now()
		s.lastAudioAt = time.Now()
		s.mu.Unlock()
		return
	}

	s.log.Info("finalizing utterance", "audio_bytes", len(audio))

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// 1. Transcribe the full utterance
		text, err := s.hub.stt.Transcribe(ctx, audio)
		if err != nil {
			s.log.Error("STT transcription failed", "error", err)
			// Reset for next utterance even on failure
			s.mu.Lock()
			s.completed = false
			s.buffer = make([]byte, 0, 256*1024)
			s.utteranceStart = time.Now()
			s.lastAudioAt = time.Now()
			s.mu.Unlock()
			return
		}

		if text == "" {
			s.log.Warn("STT returned empty text")
			s.mu.Lock()
			s.completed = false
			s.buffer = make([]byte, 0, 256*1024)
			s.utteranceStart = time.Now()
			s.lastAudioAt = time.Now()
			s.mu.Unlock()
			return
		}

		s.log.Info("transcript completed", "text_length", len(text))

		// 2. Publish final TranscriptChunk
		finalChunk := events.New(events.TranscriptTopic, s.interviewID, events.TranscriptChunk, map[string]any{
			"text":   text,
			"final":  true,
			"offset": len(audio),
		})
		s.hub.bus.Publish(ctx, finalChunk)

		// 3. Publish TranscriptCompleted — this triggers the question worker
		//    and evaluation worker in the existing pipeline.
		completed := events.New(events.TranscriptTopic, s.interviewID, events.TranscriptCompleted, map[string]any{
			"text": text,
		})
		s.hub.bus.Publish(ctx, completed)

		// 4. Also call the orchestrator to store the transcript
		//    (the orchestrator's CompleteTranscript method handles this,
		//     but since we're bypassing the REST endpoint, we do it here)
		_, err = s.hub.orch.CompleteTranscript(ctx, s.interviewID, orchestrator.TranscriptRequest{Text: text})
		if err != nil {
			s.log.Warn("orchestrator CompleteTranscript failed", "error", err)
		}

		// 5. Send confirmation back to the client
		_ = s.writeJSON(map[string]any{
			"type":   "TranscriptCompleted",
			"text":   text,
			"length": len(text),
		})

		// 6. Reset for next utterance
		s.mu.Lock()
		s.completed = false
		s.buffer = make([]byte, 0, 256*1024)
		s.utteranceStart = time.Now()
		s.lastAudioAt = time.Now()
		s.mu.Unlock()
	}()
}

// writeJSON sends a JSON text frame to the client.
func (s *audioSession) writeJSON(value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if err := writeTextFrame(s.rw, data); err != nil {
		return err
	}
	return s.rw.Flush()
}

// wsFrame represents a single WebSocket frame.
type wsFrame struct {
	opcode  byte
	payload []byte
}

// readFrame reads a single WebSocket frame from the connection.
// Supports text (0x1), binary (0x2), and close (0x8) frames.
func (s *audioSession) readFrame() (wsFrame, error) {
	// Read first 2 bytes
	header := make([]byte, 2)
	if _, err := io.ReadFull(s.rw, header); err != nil {
		return wsFrame{}, err
	}

	opcode := header[0] & 0x0F
	masked := (header[1] & 0x80) != 0
	length := int64(header[1] & 0x7F)

	// Extended payload length
	switch {
	case length == 126:
		ext := make([]byte, 2)
		if _, err := io.ReadFull(s.rw, ext); err != nil {
			return wsFrame{}, err
		}
		length = int64(binary.BigEndian.Uint16(ext))
	case length == 127:
		ext := make([]byte, 8)
		if _, err := io.ReadFull(s.rw, ext); err != nil {
			return wsFrame{}, err
		}
		length = int64(binary.BigEndian.Uint64(ext))
	}

	// Read mask key
	var maskKey [4]byte
	if masked {
		if _, err := io.ReadFull(s.rw, maskKey[:]); err != nil {
			return wsFrame{}, err
		}
	}

	// Read payload
	payload := make([]byte, length)
	if length > 0 {
		if _, err := io.ReadFull(s.rw, payload); err != nil {
			return wsFrame{}, err
		}
	}

	// Unmask if needed
	if masked {
		for i := range payload {
			payload[i] ^= maskKey[i%4]
		}
	}

	return wsFrame{opcode: opcode, payload: payload}, nil
}

// isCloseFrame checks if a frame or error indicates a WebSocket close.
func isCloseFrame(frame wsFrame) bool {
	return frame.opcode == 0x8
}

// upgrade performs the WebSocket upgrade handshake.
// Reuses the same logic as the existing WebSocket hub.
func upgradeAudio(w http.ResponseWriter, r *http.Request) (net.Conn, *bufio.ReadWriter, error) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return nil, nil, errors.New("missing websocket upgrade header")
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		return nil, nil, errors.New("missing Sec-WebSocket-Key")
	}

	hijacker, ok := w.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("websocket hijack unsupported")
	}
	conn, rw, err := hijacker.Hijack()
	if err != nil {
		return nil, nil, err
	}

	hash := sha1.Sum([]byte(key + websocketGUID))
	accept := base64.StdEncoding.EncodeToString(hash[:])
	response := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
	if _, err := rw.WriteString(response); err != nil {
		_ = conn.Close()
		return nil, nil, err
	}
	if err := rw.Flush(); err != nil {
		_ = conn.Close()
		return nil, nil, err
	}

	return conn, rw, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
