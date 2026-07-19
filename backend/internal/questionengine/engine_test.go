package questionengine

import (
	"strings"
	"testing"

	"intervue/backend/shared/models"
)

func TestPredictBuildsResumeGroundedBuffer(t *testing.T) {
	engine := New()

	prediction := engine.Predict(Input{
		Role:             "backend engineer",
		PreviousQuestion: "Walk me through a project.",
		Answer:           "I built a Kafka event pipeline with Go workers, consumer groups, retries, and latency dashboards.",
		ResumeContext:    []string{"Built Kafka and Go worker systems for realtime interview workflows."},
		QuestionNumber:   1,
	})

	if prediction.Topic != "event-driven architecture" {
		t.Fatalf("topic = %q, want event-driven architecture", prediction.Topic)
	}
	if len(prediction.Buffer) < 3 {
		t.Fatalf("buffer length = %d, want at least 3", len(prediction.Buffer))
	}
	if !strings.Contains(strings.ToLower(prediction.Question), "resume") && !strings.Contains(strings.ToLower(prediction.Question), "event-driven") {
		t.Fatalf("question %q was not resume/topic grounded", prediction.Question)
	}
}

func TestPredictEscalatesStrongAnswers(t *testing.T) {
	engine := New()

	prediction := engine.Predict(Input{
		Role:           "platform engineer",
		Answer:         "We reduced latency by partitioning event streams and adding observability around consumer lag and failure retries.",
		QuestionNumber: 3,
		Scores: []models.Score{{
			TechnicalDepth: 8,
			Correctness:    8,
			Communication:  7,
			Confidence:     7,
		}},
	})

	if prediction.Strategy != "stress" {
		t.Fatalf("strategy = %q, want stress", prediction.Strategy)
	}
	if !strings.Contains(strings.ToLower(prediction.Question), "fails first") {
		t.Fatalf("question = %q, want stress-test phrasing", prediction.Question)
	}
}

func TestPredictAvoidsRepeatingQuestions(t *testing.T) {
	engine := New()
	repeated := "What concrete signal would prove your database design decision worked in production?"

	prediction := engine.Predict(Input{
		Answer:         "I improved Postgres indexes and transaction boundaries for the API.",
		QuestionNumber: 2,
		History: []models.Transcript{{
			Question: repeated,
			Answer:   "Old answer",
		}},
	})

	for _, question := range prediction.Buffer {
		if question == repeated {
			t.Fatalf("buffer repeated historical question %q", question)
		}
	}
}
