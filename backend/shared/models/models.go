package models

import "time"

type InterviewStatus string

const (
	InterviewCreated    InterviewStatus = "created"
	InterviewInProgress InterviewStatus = "in_progress"
	InterviewFinished   InterviewStatus = "finished"
)

type Candidate struct {
	ID         string             `json:"id"`
	Name       string             `json:"name"`
	Email      string             `json:"email"`
	ResumeText string             `json:"resume_text"`
	Skills     []string           `json:"skills,omitempty"`
	Projects   []CandidateProject `json:"projects,omitempty"`
	Experience []CandidateExp     `json:"experience,omitempty"`
	CreatedAt  time.Time          `json:"created_at"`
}

type CandidateProject struct {
	Name   string `json:"name"`
	Stack  string `json:"stack"`
	Impact string `json:"impact"`
}

type CandidateExp struct {
	Role    string `json:"role"`
	Company string `json:"company"`
	Years   string `json:"years"`
}

type Interview struct {
	ID              string          `json:"id"`
	CandidateID     string          `json:"candidate_id"`
	Role            string          `json:"role"`
	Status          InterviewStatus `json:"status"`
	CurrentQuestion string          `json:"current_question"`
	QuestionNumber  int             `json:"question_number"`
	QuestionBuffer  []string        `json:"question_buffer"`
	Scores          []Score         `json:"scores"`
	Transcript      []Transcript    `json:"transcript"`
	StartedAt       time.Time       `json:"started_at"`
	EndedAt         *time.Time      `json:"ended_at,omitempty"`
}

type Transcript struct {
	Question string    `json:"question"`
	Answer   string    `json:"answer"`
	At       time.Time `json:"at"`
}

type Score struct {
	TechnicalDepth int       `json:"technical_depth"`
	Correctness    int       `json:"correctness"`
	Communication  int       `json:"communication"`
	Confidence     int       `json:"confidence"`
	Feedback       string    `json:"feedback"`
	At             time.Time `json:"at"`
}
