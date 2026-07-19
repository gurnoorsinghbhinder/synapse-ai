package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	_ "github.com/lib/pq"
	"intervue/backend/shared/events"
	"intervue/backend/shared/models"
)

var ErrNotFound = errors.New("not found")

type Store struct {
	db *sql.DB

	// Fallback in-memory structures if db is nil
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

func NewPostgresStore(connStr string) (*Store, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("store/postgres: open database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("store/postgres: ping database: %w", err)
	}

	s := &Store{db: db}

	// Bootstrap database tables
	if err := s.bootstrap(); err != nil {
		db.Close()
		return nil, fmt.Errorf("store/postgres: bootstrap tables: %w", err)
	}

	return s, nil
}

func (s *Store) bootstrap() error {
	schema := `
	CREATE TABLE IF NOT EXISTS candidates (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		email TEXT,
		resume_text TEXT NOT NULL,
		created_at TIMESTAMPTZ NOT NULL
	);

	CREATE TABLE IF NOT EXISTS interviews (
		id TEXT PRIMARY KEY,
		candidate_id TEXT NOT NULL REFERENCES candidates(id),
		role TEXT NOT NULL,
		status TEXT NOT NULL,
		current_question TEXT NOT NULL,
		question_number INT NOT NULL,
		question_buffer JSONB NOT NULL DEFAULT '[]'::jsonb,
		scores JSONB NOT NULL DEFAULT '[]'::jsonb,
		transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
		started_at TIMESTAMPTZ NOT NULL,
		ended_at TIMESTAMPTZ
	);

	CREATE TABLE IF NOT EXISTS timeline (
		id TEXT PRIMARY KEY,
		interview_id TEXT NOT NULL,
		type TEXT NOT NULL,
		topic TEXT NOT NULL,
		timestamp TIMESTAMPTZ NOT NULL,
		payload JSONB NOT NULL,
		metadata JSONB
	);
	`
	_, err := s.db.Exec(schema)
	return err
}

func (s *Store) SaveCandidate(candidate models.Candidate) models.Candidate {
	if candidate.ID == "" {
		candidate.ID = events.NewID("cand")
	}
	if candidate.CreatedAt.IsZero() {
		candidate.CreatedAt = time.Now().UTC()
	}

	if s.db != nil {
		query := `
			INSERT INTO candidates (id, name, email, resume_text, created_at)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				email = EXCLUDED.email,
				resume_text = EXCLUDED.resume_text
		`
		_, _ = s.db.Exec(query, candidate.ID, candidate.Name, candidate.Email, candidate.ResumeText, candidate.CreatedAt)
		return candidate
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.candidates[candidate.ID] = candidate
	return candidate
}

func (s *Store) Candidate(id string) (models.Candidate, bool) {
	if s.db != nil {
		query := `SELECT id, name, email, resume_text, created_at FROM candidates WHERE id = $1`
		var c models.Candidate
		var email sql.NullString
		err := s.db.QueryRow(query, id).Scan(&c.ID, &c.Name, &email, &c.ResumeText, &c.CreatedAt)
		if err != nil {
			return models.Candidate{}, false
		}
		c.Email = email.String
		return c, true
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	candidate, ok := s.candidates[id]
	return candidate, ok
}

func (s *Store) SaveInterview(interview models.Interview) models.Interview {
	if s.db != nil {
		bufferJSON, _ := json.Marshal(interview.QuestionBuffer)
		scoresJSON, _ := json.Marshal(interview.Scores)
		transcriptJSON, _ := json.Marshal(interview.Transcript)

		query := `
			INSERT INTO interviews (id, candidate_id, role, status, current_question, question_number, question_buffer, scores, transcript, started_at, ended_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			ON CONFLICT (id) DO UPDATE SET
				candidate_id = EXCLUDED.candidate_id,
				role = EXCLUDED.role,
				status = EXCLUDED.status,
				current_question = EXCLUDED.current_question,
				question_number = EXCLUDED.question_number,
				question_buffer = EXCLUDED.question_buffer,
				scores = EXCLUDED.scores,
				transcript = EXCLUDED.transcript,
				started_at = EXCLUDED.started_at,
				ended_at = EXCLUDED.ended_at
		`
		_, _ = s.db.Exec(query, interview.ID, interview.CandidateID, interview.Role, interview.Status, interview.CurrentQuestion, interview.QuestionNumber, bufferJSON, scoresJSON, transcriptJSON, interview.StartedAt, interview.EndedAt)
		return interview
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.interviews[interview.ID] = interview
	return interview
}

func (s *Store) Interview(id string) (models.Interview, bool) {
	if s.db != nil {
		query := `SELECT id, candidate_id, role, status, current_question, question_number, question_buffer, scores, transcript, started_at, ended_at FROM interviews WHERE id = $1`
		var i models.Interview
		var bufferRaw, scoresRaw, transcriptRaw []byte
		var endedAt sql.NullTime
		err := s.db.QueryRow(query, id).Scan(&i.ID, &i.CandidateID, &i.Role, &i.Status, &i.CurrentQuestion, &i.QuestionNumber, &bufferRaw, &scoresRaw, &transcriptRaw, &i.StartedAt, &endedAt)
		if err != nil {
			return models.Interview{}, false
		}
		_ = json.Unmarshal(bufferRaw, &i.QuestionBuffer)
		_ = json.Unmarshal(scoresRaw, &i.Scores)
		_ = json.Unmarshal(transcriptRaw, &i.Transcript)
		if endedAt.Valid {
			i.EndedAt = &endedAt.Time
		}
		return i, true
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	interview, ok := s.interviews[id]
	return interview, ok
}

func (s *Store) UpdateInterview(id string, fn func(*models.Interview) error) (models.Interview, error) {
	if s.db != nil {
		tx, err := s.db.Begin()
		if err != nil {
			return models.Interview{}, err
		}
		defer tx.Rollback()

		query := `SELECT id, candidate_id, role, status, current_question, question_number, question_buffer, scores, transcript, started_at, ended_at FROM interviews WHERE id = $1 FOR UPDATE`
		var i models.Interview
		var bufferRaw, scoresRaw, transcriptRaw []byte
		var endedAt sql.NullTime
		err = tx.QueryRow(query, id).Scan(&i.ID, &i.CandidateID, &i.Role, &i.Status, &i.CurrentQuestion, &i.QuestionNumber, &bufferRaw, &scoresRaw, &transcriptRaw, &i.StartedAt, &endedAt)
		if err != nil {
			return models.Interview{}, err
		}
		_ = json.Unmarshal(bufferRaw, &i.QuestionBuffer)
		_ = json.Unmarshal(scoresRaw, &i.Scores)
		_ = json.Unmarshal(transcriptRaw, &i.Transcript)
		if endedAt.Valid {
			i.EndedAt = &endedAt.Time
		}

		if err := fn(&i); err != nil {
			return models.Interview{}, err
		}

		newBufferRaw, _ := json.Marshal(i.QuestionBuffer)
		newScoresRaw, _ := json.Marshal(i.Scores)
		newTranscriptRaw, _ := json.Marshal(i.Transcript)
		
		var dbEndedAt sql.NullTime
		if i.EndedAt != nil {
			dbEndedAt.Time = *i.EndedAt
			dbEndedAt.Valid = true
		}

		updateQuery := `
			UPDATE interviews
			SET status = $1, current_question = $2, question_number = $3, question_buffer = $4, scores = $5, transcript = $6, ended_at = $7
			WHERE id = $8
		`
		_, err = tx.Exec(updateQuery, i.Status, i.CurrentQuestion, i.QuestionNumber, newBufferRaw, newScoresRaw, newTranscriptRaw, dbEndedAt, i.ID)
		if err != nil {
			return models.Interview{}, err
		}

		if err := tx.Commit(); err != nil {
			return models.Interview{}, err
		}
		return i, nil
	}

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
	if s.db != nil {
		metaJSON, _ := json.Marshal(event.Metadata)
		query := `
			INSERT INTO timeline (id, interview_id, type, topic, timestamp, payload, metadata)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`
		_, _ = s.db.Exec(query, event.ID, event.InterviewID, event.Type, event.Topic, event.Timestamp, event.Payload, metaJSON)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.timeline[event.InterviewID] = append(s.timeline[event.InterviewID], event)
}

func (s *Store) Timeline(interviewID string) []events.Event {
	if s.db != nil {
		query := `SELECT id, interview_id, type, topic, timestamp, payload, metadata FROM timeline WHERE interview_id = $1 ORDER BY timestamp ASC`
		rows, err := s.db.Query(query, interviewID)
		if err != nil {
			return nil
		}
		defer rows.Close()

		var list []events.Event
		for rows.Next() {
			var ev events.Event
			var metaRaw []byte
			err := rows.Scan(&ev.ID, &ev.InterviewID, &ev.Type, &ev.Topic, &ev.Timestamp, &ev.Payload, &metaRaw)
			if err != nil {
				continue
			}
			_ = json.Unmarshal(metaRaw, &ev.Metadata)
			list = append(list, ev)
		}
		return list
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	timeline := s.timeline[interviewID]
	out := make([]events.Event, len(timeline))
	copy(out, timeline)
	return out
}
