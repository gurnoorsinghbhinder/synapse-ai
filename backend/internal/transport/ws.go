package transport

import (
	"bufio"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"

	"intervue/backend/internal/eventbus"
	"intervue/backend/shared/events"
)

const websocketGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

type HistoryProvider interface {
	History(interviewID string) []events.Event
}

type WebSocketHub struct {
	bus     eventbus.Bus
	history HistoryProvider
}

func NewWebSocketHub(bus eventbus.Bus, history HistoryProvider) *WebSocketHub {
	return &WebSocketHub{bus: bus, history: history}
}

func (h *WebSocketHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	interviewID := r.URL.Query().Get("interview_id")
	if interviewID == "" {
		http.Error(w, "interview_id query param is required", http.StatusBadRequest)
		return
	}
	conn, rw, err := upgrade(w, r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	for _, event := range h.history.History(interviewID) {
		_ = writeJSONFrame(rw, event)
	}

	ch := h.bus.Subscribe(ctx, "ws-"+events.NewID("client"),
		events.InterviewTopic,
		events.TranscriptTopic,
		events.QuestionTopic,
		events.EvaluationTopic,
		events.AnalyticsTopic,
		events.AudioTopic,
	)

	for event := range ch {
		if event.InterviewID != interviewID {
			continue
		}
		if err := writeJSONFrame(rw, event); err != nil {
			return
		}
	}
}

func upgrade(w http.ResponseWriter, r *http.Request) (net.Conn, *bufio.ReadWriter, error) {
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

func writeJSONFrame(rw *bufio.ReadWriter, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if err := writeTextFrame(rw, data); err != nil {
		return err
	}
	return rw.Flush()
}

func writeTextFrame(rw *bufio.ReadWriter, payload []byte) error {
	header := []byte{0x81}
	length := len(payload)
	if length < 126 {
		header = append(header, byte(length))
	} else if length <= 65535 {
		header = append(header, 126, byte(length>>8), byte(length))
	} else {
		header = append(header, 127,
			byte(length>>56),
			byte(length>>48),
			byte(length>>40),
			byte(length>>32),
			byte(length>>24),
			byte(length>>16),
			byte(length>>8),
			byte(length),
		)
	}
	if _, err := rw.Write(header); err != nil {
		return err
	}
	_, err := rw.Write(payload)
	return err
}

func writeBinaryFrame(rw *bufio.ReadWriter, payload []byte) error {
	header := []byte{0x82} // binary frame opcode
	length := len(payload)
	if length < 126 {
		header = append(header, byte(length))
	} else if length <= 65535 {
		header = append(header, 126, byte(length>>8), byte(length))
	} else {
		header = append(header, 127,
			byte(length>>56),
			byte(length>>48),
			byte(length>>40),
			byte(length>>32),
			byte(length>>24),
			byte(length>>16),
			byte(length>>8),
			byte(length),
		)
	}
	if _, err := rw.Write(header); err != nil {
		return err
	}
	_, err := rw.Write(payload)
	return err
}
