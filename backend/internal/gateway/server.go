package gateway

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"intervue/backend/internal/ai"
	"intervue/backend/internal/eventbus"
	"intervue/backend/internal/orchestrator"
	"intervue/backend/internal/store"
	"intervue/backend/internal/stt"
	"intervue/backend/internal/transport"
	"intervue/backend/shared/events"
	"intervue/backend/shared/models"
)

type Server struct {
	mux          *http.ServeMux
	store        *store.Store
	orchestrator *orchestrator.Orchestrator
	ws           *transport.WebSocketHub
	audioWS      *transport.AudioWebSocketHub
	ai           ai.Client
}

func New(store *store.Store, orch *orchestrator.Orchestrator, ws *transport.WebSocketHub, aiClient ai.Client) *Server {
	server := &Server{
		mux:          http.NewServeMux(),
		store:        store,
		orchestrator: orch,
		ws:           ws,
		ai:           aiClient,
	}
	server.routes()
	return server
}

// NewWithAudio creates a server with audio WebSocket support.
// Pass in the eventbus.Bus explicitly since it's not exported from the orchestrator.
func NewWithAudio(store *store.Store, orch *orchestrator.Orchestrator, ws *transport.WebSocketHub, bus eventbus.Bus, sttClient stt.Client, aiClient ai.Client, useGeminiLive bool, geminiAPIKey string) *Server {
	server := &Server{
		mux:          http.NewServeMux(),
		store:        store,
		orchestrator: orch,
		ws:           ws,
		audioWS:      transport.NewAudioWebSocketHub(bus, orch, sttClient, store, useGeminiLive, geminiAPIKey),
		ai:           aiClient,
	}
	server.routes()
	return server
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	withCORS(s.mux).ServeHTTP(w, r)
}

func (s *Server) routes() {
	s.mux.HandleFunc("GET /health", s.health)
	s.mux.HandleFunc("POST /resume/upload", s.uploadResume)
	s.mux.HandleFunc("POST /interview/start", s.startInterview)
	s.mux.HandleFunc("POST /interview/end", s.endInterview)
	s.mux.HandleFunc("GET /interview/{id}", s.getInterview)
	s.mux.HandleFunc("POST /interview/{id}/transcript", s.completeTranscript)
	s.mux.HandleFunc("GET /candidate/{id}", s.getCandidate)
	s.mux.Handle("/ws", s.ws)

	// Audio WebSocket endpoint — only registered if audioWS was set
	if s.audioWS != nil {
		s.mux.Handle("GET /interview/{id}/audio", s.audioWS)
	}
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) uploadResume(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name       string `json:"name"`
		Email      string `json:"email"`
		ResumeText string `json:"resume_text"`
	}

	contentType := r.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(8 << 20); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		req.Name = r.FormValue("name")
		req.Email = r.FormValue("email")
		req.ResumeText = r.FormValue("resume_text")
		file, _, err := r.FormFile("resume")
		if err == nil {
			defer file.Close()
			data, _ := io.ReadAll(io.LimitReader(file, 512_000))
			req.ResumeText = string(data)
		}
	} else if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	if strings.TrimSpace(req.ResumeText) == "" {
		writeError(w, http.StatusBadRequest, errors.New("resume_text or resume file is required"))
		return
	}

	// Use Gemini to dynamically parse the resume text
	parsed, err := s.ai.ParseResume(req.ResumeText)
	if err != nil {
		// Log error and fall back to mock fields or empty arrays
		parsed = ai.CandidateProfile{
			Name:  fallback(req.Name, "Demo Candidate"),
			Email: req.Email,
		}
	}

	// Convert parsed structures into DB structures
	skills := parsed.Skills
	projects := make([]models.CandidateProject, len(parsed.Projects))
	for i, p := range parsed.Projects {
		projects[i] = models.CandidateProject{
			Name:   p.Name,
			Stack:  p.Stack,
			Impact: p.Impact,
		}
	}
	experience := make([]models.CandidateExp, len(parsed.Experience))
	for i, e := range parsed.Experience {
		experience[i] = models.CandidateExp{
			Role:    e.Role,
			Company: e.Company,
			Years:   e.Years,
		}
	}

	candidate := s.store.SaveCandidate(models.Candidate{
		Name:       fallback(parsed.Name, fallback(req.Name, "Demo Candidate")),
		Email:      fallback(parsed.Email, req.Email),
		ResumeText: req.ResumeText,
		Skills:     skills,
		Projects:   projects,
		Experience: experience,
		CreatedAt:  time.Now().UTC(),
	})

	writeJSON(w, http.StatusCreated, map[string]any{
		"candidate": candidate,
		"event": events.New(events.InterviewTopic, "", events.ResumeUploaded, map[string]any{
			"candidate_id": candidate.ID,
		}),
	})
}

func (s *Server) startInterview(w http.ResponseWriter, r *http.Request) {
	var req orchestrator.StartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	interview, err := s.orchestrator.StartInterview(r.Context(), req)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, errors.New("candidate profile not found; please upload a resume first"))
			return
		}
		writeError(w, status, err)
		return
	}

	writeJSON(w, http.StatusCreated, interview)
}

func (s *Server) endInterview(w http.ResponseWriter, r *http.Request) {
	var req struct {
		InterviewID string `json:"interview_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	interview, err := s.orchestrator.EndInterview(r.Context(), req.InterviewID)
	if err != nil {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeJSON(w, http.StatusOK, interview)
}

func (s *Server) getInterview(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	interview, ok := s.store.Interview(id)
	if !ok {
		writeError(w, http.StatusNotFound, store.ErrNotFound)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"interview": interview,
		"timeline":  s.store.Timeline(id),
	})
}

func (s *Server) getCandidate(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	candidate, ok := s.store.Candidate(id)
	if !ok {
		writeError(w, http.StatusNotFound, store.ErrNotFound)
		return
	}
	writeJSON(w, http.StatusOK, candidate)
}

func (s *Server) completeTranscript(w http.ResponseWriter, r *http.Request) {
	var req orchestrator.TranscriptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	interview, err := s.orchestrator.CompleteTranscript(r.Context(), r.PathValue("id"), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusAccepted, interview)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func fallback(value string, defaultValue string) string {
	if strings.TrimSpace(value) == "" {
		return defaultValue
	}
	return value
}
