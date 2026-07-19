package workers

import (
	"context"
	"time"

	"intervue/backend/internal/ai"
	"intervue/backend/internal/eventbus"
	"intervue/backend/internal/orchestrator"
	"intervue/backend/internal/store"
	"intervue/backend/shared/events"
	"intervue/backend/shared/models"
)

type Runtime struct {
	bus          eventbus.Bus
	store        *store.Store
	ai           ai.Client
	orchestrator *orchestrator.Orchestrator
}

func NewRuntime(bus eventbus.Bus, store *store.Store, aiClient ai.Client, orch *orchestrator.Orchestrator) *Runtime {
	return &Runtime{bus: bus, store: store, ai: aiClient, orchestrator: orch}
}

func (r *Runtime) Start(ctx context.Context) {
	go r.resumeContextWorker(ctx)
	go r.questionWorker(ctx)
	go r.evaluationWorker(ctx)
	go r.analyticsWorker(ctx)
	go r.timelineWorker(ctx)
}

func (r *Runtime) resumeContextWorker(ctx context.Context) {
	ch := r.bus.Subscribe(ctx, "resume-context-worker", events.InterviewTopic)
	for event := range ch {
		if event.Type != events.InterviewStarted {
			continue
		}
		interview, ok := r.store.Interview(event.InterviewID)
		if !ok {
			continue
		}
		candidate, ok := r.store.Candidate(interview.CandidateID)
		if !ok {
			continue
		}
		chunks, _ := r.ai.ExtractResumeContext(candidate.ResumeText)
		r.bus.Publish(ctx, events.New(events.InterviewTopic, event.InterviewID, events.ResumeLoaded, map[string]any{
			"candidate_id": interview.CandidateID,
			"chunks":       chunks,
		}))
	}
}

func (r *Runtime) questionWorker(ctx context.Context) {
	ch := r.bus.Subscribe(ctx, "question-worker", events.TranscriptTopic)
	for event := range ch {
		if event.Type != events.TranscriptCompleted {
			continue
		}
		payload, err := orchestrator.DecodePayload[struct {
			Question string `json:"question"`
			Answer   string `json:"answer"`
		}](event)
		if err != nil {
			continue
		}
		interview, ok := r.store.Interview(event.InterviewID)
		if !ok {
			continue
		}

		question, _ := r.ai.GenerateQuestion(ai.QuestionRequest{
			Role:             interview.Role,
			PreviousQuestion: payload.Question,
			Answer:           payload.Answer,
			QuestionNumber:   interview.QuestionNumber,
		})
		buffer := []string{
			question,
			"What signal in this answer would convince you it is production-ready?",
			"How would your design change if traffic increased by 10x?",
		}

		r.bus.Publish(ctx, events.New(events.QuestionTopic, event.InterviewID, events.QuestionGenerated, map[string]any{
			"question": question,
			"buffer":   buffer,
		}))
		_, _ = r.orchestrator.ApplyGeneratedQuestion(ctx, event.InterviewID, question, buffer)
	}
}

func (r *Runtime) evaluationWorker(ctx context.Context) {
	ch := r.bus.Subscribe(ctx, "evaluation-worker", events.TranscriptTopic)
	for event := range ch {
		if event.Type != events.TranscriptCompleted {
			continue
		}
		payload, err := orchestrator.DecodePayload[struct {
			Question string `json:"question"`
			Answer   string `json:"answer"`
		}](event)
		if err != nil {
			continue
		}
		interview, ok := r.store.Interview(event.InterviewID)
		if !ok {
			continue
		}
		result, _ := r.ai.EvaluateAnswer(ai.EvaluationRequest{
			Question: payload.Question,
			Answer:   payload.Answer,
			Role:     interview.Role,
		})

		score := models.Score{
			TechnicalDepth: result.TechnicalDepth,
			Correctness:    result.Correctness,
			Communication:  result.Communication,
			Confidence:     result.Confidence,
			Feedback:       result.Feedback,
			At:             time.Now().UTC(),
		}
		_, _ = r.orchestrator.ApplyEvaluation(event.InterviewID, score)
		r.bus.Publish(ctx, events.New(events.EvaluationTopic, event.InterviewID, events.AnswerEvaluated, score))
	}
}

func (r *Runtime) analyticsWorker(ctx context.Context) {
	ch := r.bus.Subscribe(ctx, "analytics-worker", events.InterviewTopic, events.TranscriptTopic, events.QuestionTopic, events.EvaluationTopic)
	start := time.Now()
	count := 0
	for event := range ch {
		count++
		elapsed := time.Since(start).Seconds()
		if elapsed == 0 {
			elapsed = 1
		}
		r.bus.Publish(ctx, events.New(events.AnalyticsTopic, event.InterviewID, events.MetricsUpdated, map[string]any{
			"events_published":  count,
			"events_per_sec":    float64(count) / elapsed,
			"worker_latency_ms": time.Since(event.Timestamp).Milliseconds(),
		}))
	}
}

func (r *Runtime) timelineWorker(ctx context.Context) {
	ch := r.bus.Subscribe(ctx, "timeline-worker", events.InterviewTopic, events.TranscriptTopic, events.QuestionTopic, events.EvaluationTopic, events.AnalyticsTopic)
	for event := range ch {
		r.store.AppendTimeline(event)
		if event.Type == events.TimelineUpdated {
			continue
		}
		r.bus.Publish(ctx, events.New(events.AnalyticsTopic, event.InterviewID, events.TimelineUpdated, map[string]any{
			"event_id": event.ID,
			"type":     event.Type,
		}))
	}
}
