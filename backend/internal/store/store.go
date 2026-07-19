package store

import (
	"errors"
	"sync"
	"time"

	"intervue/backend/shared/events"
	"intervue/backend/shared/models"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	mu         sync.RWMutex
	candidates map[string]models.Candidate
	interviews map[string]models.Interview
	timeline   map[string][]events.Event
}

func New() *Store {
	return &Store{
		candidates: make(map[string]models.Candidate),
		interviews: make(map[string]models.Interview),
		timeline:   make(map[string][]events.Event),
	}
}

func (s *Store) SaveCandidate(candidate models.Candidate) models.Candidate {
	s.mu.Lock()
	defer s.mu.Unlock()

	if candidate.ID == "" {
		candidate.ID = events.NewID("cand")
	}
	if candidate.CreatedAt.IsZero() {
		candidate.CreatedAt = time.Now().UTC()
	}
	s.candidates[candidate.ID] = candidate

	return candidate
}

func (s *Store) Candidate(id string) (models.Candidate, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	candidate, ok := s.candidates[id]
	return candidate, ok
}

func (s *Store) SaveInterview(interview models.Interview) models.Interview {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.interviews[interview.ID] = interview
	return interview
}

func (s *Store) Interview(id string) (models.Interview, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	interview, ok := s.interviews[id]
	return interview, ok
}

func (s *Store) UpdateInterview(id string, fn func(*models.Interview) error) (models.Interview, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	interview, ok := s.interviews[id]
	if !ok {
		return models.Interview{}, ErrNotFound
	}
	if err := fn(&interview); err != nil {
		return models.Interview{}, err
	}
	s.interviews[id] = interview

	return interview, nil
}

func (s *Store) AppendTimeline(event events.Event) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.timeline[event.InterviewID] = append(s.timeline[event.InterviewID], event)
}

func (s *Store) Timeline(interviewID string) []events.Event {
	s.mu.RLock()
	defer s.mu.RUnlock()

	timeline := s.timeline[interviewID]
	out := make([]events.Event, len(timeline))
	copy(out, timeline)
	return out
}
