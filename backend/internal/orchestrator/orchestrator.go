package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"intervue/backend/internal/ai"
	"intervue/backend/internal/eventbus"
	"intervue/backend/internal/store"
	"intervue/backend/shared/events"
	"intervue/backend/shared/models"
)

type Orchestrator struct {
	bus   eventbus.Bus
	store *store.Store
	ai    ai.Client
}

type StartRequest struct {
	CandidateID string `json:"candidate_id"`
	Role        string `json:"role"`
}

type TranscriptRequest struct {
	Text string `json:"text"`
}

func New(bus eventbus.Bus, store *store.Store, aiClient ai.Client) *Orchestrator {
	return &Orchestrator{bus: bus, store: store, ai: aiClient}
}

func (o *Orchestrator) StartInterview(ctx context.Context, req StartRequest) (models.Interview, error) {
	if req.CandidateID == "" {
		return models.Interview{}, errors.New("candidate_id is required")
	}
	if _, ok := o.store.Candidate(req.CandidateID); !ok {
		return models.Interview{}, store.ErrNotFound
	}

	interview := models.Interview{
		ID:             events.NewID("int"),
		CandidateID:    req.CandidateID,
		Role:           req.Role,
		Status:         models.InterviewInProgress,
		QuestionNumber: 0,
		StartedAt:      time.Now().UTC(),
	}
	o.store.SaveInterview(interview)

	o.publish(ctx, events.InterviewTopic, interview.ID, events.InterviewStarted, map[string]any{
		"candidate_id": req.CandidateID,
		"role":         req.Role,
	})

	question, err := o.ai.GenerateQuestion(ai.QuestionRequest{Role: req.Role})
	if err != nil {
		return models.Interview{}, err
	}

	interview, err = o.askQuestion(ctx, interview.ID, question)
	if err != nil {
		return models.Interview{}, err
	}

	return interview, nil
}

func (o *Orchestrator) CompleteTranscript(ctx context.Context, interviewID string, req TranscriptRequest) (models.Interview, error) {
	if req.Text == "" {
		return models.Interview{}, errors.New("text is required")
	}

	interview, err := o.store.UpdateInterview(interviewID, func(interview *models.Interview) error {
		if interview.Status != models.InterviewInProgress {
			return errors.New("interview is not in progress")
		}
		interview.Transcript = append(interview.Transcript, models.Transcript{
			Question: interview.CurrentQuestion,
			Answer:   req.Text,
			At:       time.Now().UTC(),
		})
		return nil
	})
	if err != nil {
		return models.Interview{}, err
	}

	o.publish(ctx, events.TranscriptTopic, interviewID, events.TranscriptCompleted, map[string]any{
		"question": interview.CurrentQuestion,
		"answer":   req.Text,
	})

	return interview, nil
}

func (o *Orchestrator) EndInterview(ctx context.Context, interviewID string) (models.Interview, error) {
	now := time.Now().UTC()
	interview, err := o.store.UpdateInterview(interviewID, func(interview *models.Interview) error {
		interview.Status = models.InterviewFinished
		interview.EndedAt = &now
		return nil
	})
	if err != nil {
		return models.Interview{}, err
	}

	o.publish(ctx, events.InterviewTopic, interviewID, events.InterviewFinished, map[string]any{
		"duration_seconds": int(now.Sub(interview.StartedAt).Seconds()),
	})

	return interview, nil
}

func (o *Orchestrator) ApplyGeneratedQuestion(ctx context.Context, interviewID string, question string, buffer []string) (models.Interview, error) {
	interview, err := o.store.UpdateInterview(interviewID, func(interview *models.Interview) error {
		interview.QuestionBuffer = buffer
		return nil
	})
	if err != nil {
		return models.Interview{}, err
	}

	if question == "" {
		return interview, nil
	}

	return o.askQuestion(ctx, interviewID, question)
}

func (o *Orchestrator) ApplyEvaluation(interviewID string, score models.Score) (models.Interview, error) {
	return o.store.UpdateInterview(interviewID, func(interview *models.Interview) error {
		interview.Scores = append(interview.Scores, score)
		return nil
	})
}

func (o *Orchestrator) askQuestion(ctx context.Context, interviewID string, question string) (models.Interview, error) {
	interview, err := o.store.UpdateInterview(interviewID, func(interview *models.Interview) error {
		interview.CurrentQuestion = question
		interview.QuestionNumber++
		return nil
	})
	if err != nil {
		return models.Interview{}, err
	}

	o.publish(ctx, events.InterviewTopic, interviewID, events.QuestionAsked, map[string]any{
		"question":        question,
		"question_number": interview.QuestionNumber,
	})

	return interview, nil
}

func (o *Orchestrator) publish(ctx context.Context, topic events.Topic, interviewID string, eventType events.Type, payload any) {
	event := events.New(topic, interviewID, eventType, payload)
	o.bus.Publish(ctx, event)
}

func DecodePayload[T any](event events.Event) (T, error) {
	var payload T
	err := json.Unmarshal(event.Payload, &payload)
	return payload, err
}
