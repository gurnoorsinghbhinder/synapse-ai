package events

import (
	"encoding/json"
	"time"
)

type Type string

const (
	InterviewStarted    Type = "InterviewStarted"
	InterviewFinished   Type = "InterviewFinished"
	ResumeUploaded      Type = "ResumeUploaded"
	ResumeLoaded        Type = "ResumeLoaded"
	QuestionAsked       Type = "QuestionAsked"
	TranscriptChunk     Type = "TranscriptChunk"
	TranscriptCompleted Type = "TranscriptCompleted"
	AnswerEvaluated     Type = "AnswerEvaluated"
	QuestionGenerated   Type = "QuestionGenerated"
	MetricsUpdated      Type = "MetricsUpdated"
	TimelineUpdated     Type = "TimelineUpdated"
)

type Topic string

const (
	InterviewTopic  Topic = "interview.events"
	TranscriptTopic Topic = "transcript.events"
	QuestionTopic   Topic = "question.events"
	EvaluationTopic Topic = "evaluation.events"
	AnalyticsTopic  Topic = "analytics.events"
)

type Event struct {
	ID          string            `json:"id"`
	InterviewID string            `json:"interview_id"`
	Type        Type              `json:"type"`
	Topic       Topic             `json:"topic"`
	Timestamp   time.Time         `json:"timestamp"`
	Payload     json.RawMessage   `json:"payload"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

func New(topic Topic, interviewID string, eventType Type, payload any) Event {
	data, err := json.Marshal(payload)
	if err != nil {
		data = json.RawMessage(`{"error":"payload marshal failed"}`)
	}

	return Event{
		ID:          NewID("evt"),
		InterviewID: interviewID,
		Type:        eventType,
		Topic:       topic,
		Timestamp:   time.Now().UTC(),
		Payload:     data,
		Metadata:    map[string]string{"source": "intervue-backend"},
	}
}
