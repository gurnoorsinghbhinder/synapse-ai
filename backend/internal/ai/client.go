package ai

import (
	"fmt"
	"strings"
)

type Client interface {
	GenerateQuestion(QuestionRequest) (string, error)
	EvaluateAnswer(EvaluationRequest) (EvaluationResult, error)
	ExtractResumeContext(resumeText string) ([]string, error)
}

type QuestionRequest struct {
	Role             string
	PreviousQuestion string
	Answer           string
	ResumeContext    []string
	QuestionNumber   int
}

type EvaluationRequest struct {
	Question string
	Answer   string
	Role     string
}

type EvaluationResult struct {
	TechnicalDepth int    `json:"technical_depth"`
	Correctness    int    `json:"correctness"`
	Communication  int    `json:"communication"`
	Confidence     int    `json:"confidence"`
	Feedback       string `json:"feedback"`
}

type MockClient struct{}

func (MockClient) GenerateQuestion(req QuestionRequest) (string, error) {
	seed := "the candidate's last answer"
	if strings.TrimSpace(req.Answer) != "" {
		words := strings.Fields(req.Answer)
		if len(words) > 10 {
			words = words[:10]
		}
		seed = strings.Join(words, " ")
	}

	switch req.QuestionNumber {
	case 0:
		return fmt.Sprintf("Walk me through the most relevant project on your resume for a %s role.", fallback(req.Role, "software engineering")), nil
	case 1:
		return fmt.Sprintf("You mentioned %q. What tradeoff did you make and why?", seed), nil
	default:
		return fmt.Sprintf("Go one level deeper on %q. How would you improve it under production constraints?", seed), nil
	}
}

func (MockClient) EvaluateAnswer(req EvaluationRequest) (EvaluationResult, error) {
	wordCount := len(strings.Fields(req.Answer))
	score := clamp(2+wordCount/12, 2, 9)
	if strings.Contains(strings.ToLower(req.Answer), "tradeoff") || strings.Contains(strings.ToLower(req.Answer), "latency") {
		score++
	}

	return EvaluationResult{
		TechnicalDepth: clamp(score, 1, 10),
		Correctness:    clamp(score-1, 1, 10),
		Communication:  clamp(3+wordCount/10, 1, 10),
		Confidence:     clamp(4+wordCount/18, 1, 10),
		Feedback:       "Good structure. Add concrete metrics, edge cases, and the reasoning behind the final design choice.",
	}, nil
}

func (MockClient) ExtractResumeContext(resumeText string) ([]string, error) {
	chunks := strings.Split(strings.TrimSpace(resumeText), "\n")
	out := make([]string, 0, 3)
	for _, chunk := range chunks {
		chunk = strings.TrimSpace(chunk)
		if chunk != "" {
			out = append(out, chunk)
		}
		if len(out) == 3 {
			break
		}
	}
	if len(out) == 0 {
		out = append(out, "No resume context uploaded yet; use general software engineering questions.")
	}
	return out, nil
}

func fallback(value string, defaultValue string) string {
	if strings.TrimSpace(value) == "" {
		return defaultValue
	}
	return value
}

func clamp(value int, minValue int, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}
