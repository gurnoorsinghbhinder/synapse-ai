package questionengine

import (
	"fmt"
	"regexp"
	"sort"
	"strings"

	"intervue/backend/shared/models"
)

type Engine struct{}

type Input struct {
	Role             string
	PreviousQuestion string
	Answer           string
	ResumeContext    []string
	History          []models.Transcript
	Scores           []models.Score
	QuestionNumber   int
}

type Prediction struct {
	Question   string   `json:"question"`
	Buffer     []string `json:"buffer"`
	Topic      string   `json:"topic"`
	Difficulty string   `json:"difficulty"`
	Strategy   string   `json:"strategy"`
	Signals    []string `json:"signals"`
	TopicShift bool     `json:"topic_shift"`
}

type topicProfile struct {
	Name     string
	Keywords []string
}

var topics = []topicProfile{
	{Name: "event-driven architecture", Keywords: []string{"event", "kafka", "redpanda", "queue", "topic", "consumer", "producer", "message", "stream"}},
	{Name: "database design", Keywords: []string{"postgres", "mysql", "database", "schema", "index", "transaction", "query", "sql"}},
	{Name: "caching and session state", Keywords: []string{"redis", "cache", "ttl", "session", "memory", "invalidate"}},
	{Name: "distributed systems", Keywords: []string{"distributed", "replica", "partition", "consistency", "availability", "latency", "failover"}},
	{Name: "go concurrency", Keywords: []string{"go", "goroutine", "channel", "mutex", "worker", "concurrency", "parallel"}},
	{Name: "api design", Keywords: []string{"api", "gateway", "rest", "grpc", "websocket", "endpoint", "http"}},
	{Name: "observability", Keywords: []string{"metric", "log", "trace", "latency", "dashboard", "monitor", "alert"}},
	{Name: "ai systems", Keywords: []string{"llm", "model", "embedding", "vector", "prompt", "stt", "tts", "transcript"}},
}

var nonWord = regexp.MustCompile(`[^a-z0-9]+`)

func New() *Engine {
	return &Engine{}
}

func (e *Engine) Predict(input Input) Prediction {
	answer := strings.TrimSpace(input.Answer)
	topic, signals := detectTopic(answer, input.ResumeContext)
	difficulty := chooseDifficulty(answer, input.Scores)
	strategy := chooseStrategy(input.QuestionNumber, answer, input.Scores)
	shift := topicShifted(topic, input.History)
	resumeAnchor := bestResumeAnchor(input.ResumeContext, topic)
	role := fallback(input.Role, "software engineering")

	candidates := []string{
		primaryQuestion(strategy, difficulty, role, topic, answer, resumeAnchor, shift),
		fmt.Sprintf("What concrete signal would prove your %s decision worked in production?", topic),
		fmt.Sprintf("How would your %s design change if traffic increased by 10x?", topic),
		fmt.Sprintf("What was the hardest tradeoff in that %s approach, and what did you reject?", topic),
		fmt.Sprintf("Tie this back to your resume: where have you applied %s under real constraints?", topic),
		"What failure mode would you test first before shipping this?",
		"Which metric would you put on the dashboard for this system, and what threshold would page you?",
	}

	buffer := dedupeQuestions(candidates, input.History)
	if len(buffer) > 5 {
		buffer = buffer[:5]
	}

	return Prediction{
		Question:   buffer[0],
		Buffer:     buffer,
		Topic:      topic,
		Difficulty: difficulty,
		Strategy:   strategy,
		Signals:    signals,
		TopicShift: shift,
	}
}

func primaryQuestion(strategy string, difficulty string, role string, topic string, answer string, resumeAnchor string, shifted bool) string {
	if shifted {
		return fmt.Sprintf("You shifted into %s. Connect that back to the previous design: what changed in your assumptions?", topic)
	}

	switch strategy {
	case "clarify":
		return fmt.Sprintf("Give me a more concrete example of your %s work: what did you build, what broke, and how did you know it worked?", topic)
	case "resume_probe":
		return fmt.Sprintf("Walk me through the %s part of this resume line: %s", topic, resumeAnchor)
	case "fundamentals":
		return fmt.Sprintf("Before we go deeper, explain the core %s concept you relied on as if you were mentoring a junior engineer.", topic)
	case "deepen":
		return fmt.Sprintf("Go one level deeper on %s: what was the bottleneck, and how did you validate the fix?", topic)
	case "stress":
		return fmt.Sprintf("For a %s role, stress-test that %s design: what fails first at 10x load?", role, topic)
	default:
		return fmt.Sprintf("You mentioned %q. What tradeoff did you make and why?", excerpt(answer, 10))
	}
}

func chooseStrategy(questionNumber int, answer string, scores []models.Score) string {
	if questionNumber <= 1 {
		return "resume_probe"
	}

	latest, ok := latestScore(scores)
	if ok {
		if latest.TechnicalDepth <= 4 || latest.Correctness <= 4 {
			return "fundamentals"
		}
		if latest.TechnicalDepth >= 7 && latest.Communication >= 6 {
			return "stress"
		}
	}

	wordCount := len(strings.Fields(answer))
	if wordCount < 18 {
		return "clarify"
	}

	if containsAny(strings.ToLower(answer), "tradeoff", "latency", "scale", "failure", "consistency", "partition") {
		return "stress"
	}
	return "deepen"
}

func chooseDifficulty(answer string, scores []models.Score) string {
	latest, ok := latestScore(scores)
	if ok {
		avg := (latest.TechnicalDepth + latest.Correctness + latest.Communication + latest.Confidence) / 4
		if avg >= 7 {
			return "hard"
		}
		if avg <= 4 {
			return "supportive"
		}
	}
	if len(strings.Fields(answer)) > 45 {
		return "medium-hard"
	}
	return "medium"
}

func detectTopic(answer string, resumeContext []string) (string, []string) {
	text := strings.ToLower(answer + " " + strings.Join(resumeContext, " "))
	type match struct {
		name  string
		score int
		hits  []string
	}
	matches := make([]match, 0, len(topics))
	for _, topic := range topics {
		hits := make([]string, 0, len(topic.Keywords))
		for _, keyword := range topic.Keywords {
			if strings.Contains(text, keyword) {
				hits = append(hits, keyword)
			}
		}
		if len(hits) > 0 {
			matches = append(matches, match{name: topic.Name, score: len(hits), hits: hits})
		}
	}
	sort.Slice(matches, func(i int, j int) bool {
		return matches[i].score > matches[j].score
	})
	if len(matches) == 0 {
		return "system design", []string{"general-system-design"}
	}
	return matches[0].name, matches[0].hits
}

func topicShifted(topic string, history []models.Transcript) bool {
	if len(history) < 2 {
		return false
	}
	previous := history[len(history)-2]
	previousTopic, _ := detectTopic(previous.Answer, nil)
	return previousTopic != "system design" && previousTopic != topic
}

func bestResumeAnchor(resumeContext []string, topic string) string {
	if len(resumeContext) == 0 {
		return "No resume context loaded yet."
	}
	topicTokens := strings.Fields(topic)
	for _, chunk := range resumeContext {
		lower := strings.ToLower(chunk)
		for _, token := range topicTokens {
			if strings.Contains(lower, token) {
				return excerpt(chunk, 22)
			}
		}
	}
	return excerpt(resumeContext[0], 22)
}

func dedupeQuestions(candidates []string, history []models.Transcript) []string {
	seen := make(map[string]bool)
	for _, item := range history {
		seen[questionKey(item.Question)] = true
	}

	out := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		key := questionKey(candidate)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, candidate)
	}
	if len(out) == 0 {
		out = append(out, "What would you improve if you rebuilt this system today?")
	}
	return out
}

func questionKey(question string) string {
	normalized := nonWord.ReplaceAllString(strings.ToLower(question), " ")
	words := strings.Fields(normalized)
	if len(words) > 8 {
		words = words[:8]
	}
	return strings.Join(words, " ")
}

func latestScore(scores []models.Score) (models.Score, bool) {
	if len(scores) == 0 {
		return models.Score{}, false
	}
	return scores[len(scores)-1], true
}

func containsAny(text string, terms ...string) bool {
	for _, term := range terms {
		if strings.Contains(text, term) {
			return true
		}
	}
	return false
}

func excerpt(text string, limit int) string {
	words := strings.Fields(strings.TrimSpace(text))
	if len(words) == 0 {
		return "that system"
	}
	if len(words) > limit {
		words = words[:limit]
	}
	return strings.Join(words, " ")
}

func fallback(value string, defaultValue string) string {
	if strings.TrimSpace(value) == "" {
		return defaultValue
	}
	return value
}
