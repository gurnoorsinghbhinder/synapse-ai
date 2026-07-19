package store

import (
	"errors"
	"testing"

	"intervue/backend/shared/events"
	"intervue/backend/shared/models"
)

func TestStore_InmemoryFallback(t *testing.T) {
	s := New()

	// 1. Test SaveCandidate and Candidate
	c := models.Candidate{
		Name:       "Test User",
		Email:      "test@example.com",
		ResumeText: "Test Resume content",
	}
	savedCand := s.SaveCandidate(c)
	if savedCand.ID == "" {
		t.Fatal("expected auto-generated candidate ID, got empty string")
	}

	foundCand, ok := s.Candidate(savedCand.ID)
	if !ok {
		t.Fatalf("expected candidate %s to be found", savedCand.ID)
	}
	if foundCand.Name != c.Name || foundCand.Email != c.Email {
		t.Errorf("got candidate %+v, want %+v", foundCand, c)
	}

	// 2. Test SaveInterview and Interview
	i := models.Interview{
		ID:              "int_1",
		CandidateID:     savedCand.ID,
		Role:            "Frontend Engineer",
		Status:          models.InterviewCreated,
		CurrentQuestion: "Tell me about React.",
		QuestionNumber:  1,
	}
	_ = s.SaveInterview(i)
	foundInt, ok := s.Interview(i.ID)
	if !ok {
		t.Fatalf("expected interview %s to be found", i.ID)
	}
	if foundInt.Role != i.Role || foundInt.Status != i.Status {
		t.Errorf("got interview %+v, want %+v", foundInt, i)
	}

	// 3. Test UpdateInterview
	updatedInt, err := s.UpdateInterview(i.ID, func(interview *models.Interview) error {
		interview.Status = models.InterviewInProgress
		interview.QuestionNumber = 2
		return nil
	})
	if err != nil {
		t.Fatalf("unexpected error updating interview: %v", err)
	}
	if updatedInt.Status != models.InterviewInProgress || updatedInt.QuestionNumber != 2 {
		t.Errorf("unexpected updated interview state: %+v", updatedInt)
	}

	// 4. Test UpdateInterview failure propagation
	_, err = s.UpdateInterview(i.ID, func(interview *models.Interview) error {
		return errors.New("test error")
	})
	if err == nil || err.Error() != "test error" {
		t.Errorf("expected 'test error', got %v", err)
	}

	// 5. Test AppendTimeline and Timeline
	evt1 := events.New(events.InterviewTopic, i.ID, events.InterviewStarted, map[string]any{"ok": true})
	evt2 := events.New(events.InterviewTopic, i.ID, events.QuestionAsked, map[string]any{"ok": true})
	s.AppendTimeline(evt1)
	s.AppendTimeline(evt2)

	timeline := s.Timeline(i.ID)
	if len(timeline) != 2 {
		t.Fatalf("expected 2 timeline items, got %d", len(timeline))
	}
	if timeline[0].Type != events.InterviewStarted || timeline[1].Type != events.QuestionAsked {
		t.Errorf("unexpected timeline event order/types: %+v", timeline)
	}
}
