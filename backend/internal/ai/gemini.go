package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

var timeSleep = time.Sleep

type GeminiClient struct {
	apiKey  string
	model   string
	baseURL string
	httpCli *http.Client
}

func NewGeminiClient() *GeminiClient {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("GOOGLE_API_KEY")
	}
	model := os.Getenv("GEMINI_MODEL")
	if model == "" {
		model = "gemini-3.1-flash-lite"
	}
	baseURL := os.Getenv("GEMINI_BASE_URL")
	if baseURL == "" {
		baseURL = "https://generativelanguage.googleapis.com"
	}
	return &GeminiClient{
		apiKey:  apiKey,
		model:   model,
		baseURL: baseURL,
		httpCli: &http.Client{Timeout: 30 * time.Second},
	}
}

// ---------------------------------------------------------------------------
// Gemini API request / response types
// ---------------------------------------------------------------------------

type geminiRequest struct {
	Contents          []geminiContent         `json:"contents"`
	GenerationConfig  *geminiGenerationConfig `json:"generationConfig,omitempty"`
	SystemInstruction *geminiContent          `json:"systemInstruction,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiGenerationConfig struct {
	Temperature     float64 `json:"temperature,omitempty"`
	MaxOutputTokens int     `json:"maxOutputTokens,omitempty"`
}

type geminiResponse struct {
	Candidates []geminiCandidate `json:"candidates"`
	Error      *geminiError      `json:"error,omitempty"`
}

type geminiCandidate struct {
	Content geminiContent `json:"content"`
}

type geminiError struct {
	Message string `json:"message"`
}

// ---------------------------------------------------------------------------
// Client interface implementation
// ---------------------------------------------------------------------------

func (g *GeminiClient) GenerateQuestion(req QuestionRequest) (string, error) {
	prompt := fmt.Sprintf(`You are a technical interviewer for a %s role. Generate a single follow-up question.

Context:
- Role: %s
- Previous question: %s
- Candidate's answer: %s
- Question number: %d
- Resume context: %s

Rules:
- Ask one concise, specific question that probes deeper into the candidate's answer.
- Reference their answer directly.
- If question number is 0, ask an opening question about their most relevant project.
- Do NOT include any preamble, numbering, or extra text — output only the question.`, req.Role, req.Role, req.PreviousQuestion, req.Answer, req.QuestionNumber, strings.Join(req.ResumeContext, "; "))

	return g.generate(prompt)
}

func (g *GeminiClient) EvaluateAnswer(req EvaluationRequest) (EvaluationResult, error) {
	prompt := fmt.Sprintf(`You are evaluating a technical interview answer for a %s role.

Question: %s
Answer: %s

Rate each dimension 1-10 and provide brief feedback.

Return valid JSON only (no markdown, no backticks):
{
  "technical_depth": <int>,
  "correctness": <int>,
  "communication": <int>,
  "confidence": <int>,
  "feedback": "<string>"
}`, req.Role, req.Question, req.Answer)

	raw, err := g.generate(prompt)
	if err != nil {
		return EvaluationResult{}, err
	}

	// Strip markdown fences if present
	raw = stripMarkdown(raw)

	var result EvaluationResult
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		// Fallback: parse what we can
		result.Feedback = raw
		result.TechnicalDepth = 5
		result.Correctness = 5
		result.Communication = 5
		result.Confidence = 5
	}
	result.TechnicalDepth = clamp(result.TechnicalDepth, 1, 10)
	result.Correctness = clamp(result.Correctness, 1, 10)
	result.Communication = clamp(result.Communication, 1, 10)
	result.Confidence = clamp(result.Confidence, 1, 10)
	return result, nil
}

func (g *GeminiClient) ExtractResumeContext(resumeText string) ([]string, error) {
	prompt := fmt.Sprintf(`Extract the 3 most relevant technical experience bullet points from this resume text. Return them as a JSON array of strings.

Resume:
%s

Return valid JSON only (no markdown, no backticks):
["<bullet point 1>", "<bullet point 2>", "<bullet point 3>"]`, resumeText)

	raw, err := g.generate(prompt)
	if err != nil {
		return nil, err
	}
	raw = stripMarkdown(raw)

	var chunks []string
	if err := json.Unmarshal([]byte(raw), &chunks); err != nil || len(chunks) == 0 {
		// Fallback: split by newlines
		chunks = strings.Split(strings.TrimSpace(resumeText), "\n")
		out := make([]string, 0, 3)
		for _, c := range chunks {
			c = strings.TrimSpace(c)
			if c != "" {
				out = append(out, c)
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
	return chunks, nil
}

func (g *GeminiClient) SummarizeInterview(req SummarizeRequest) (string, error) {
	var transcriptParts []string
	for _, t := range req.Transcript {
		transcriptParts = append(transcriptParts, fmt.Sprintf("Q: %s\nA: %s", t.Question, t.Answer))
	}
	transcriptText := strings.Join(transcriptParts, "\n\n")

	var scoreParts []string
	for _, s := range req.Scores {
		scoreParts = append(scoreParts, fmt.Sprintf("Technical:%d Correctness:%d Communication:%d Confidence:%d",
			s.TechnicalDepth, s.Correctness, s.Communication, s.Confidence))
	}
	scoresText := strings.Join(scoreParts, "\n")

	prompt := fmt.Sprintf(`Summarize this technical interview for a %s role.

Transcript:
%s

Scores:
%s

Provide a concise summary (2-3 paragraphs) covering:
1. Overall performance
2. Key strengths
3. Areas for improvement
4. Hiring recommendation`, req.Role, transcriptText, scoresText)

	return g.generate(prompt)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (g *GeminiClient) generate(prompt string) (string, error) {
	body := geminiRequest{
		Contents: []geminiContent{
			{
				Role:  "user",
				Parts: []geminiPart{{Text: prompt}},
			},
		},
		GenerationConfig: &geminiGenerationConfig{
			Temperature:     0.7,
			MaxOutputTokens: 1024,
		},
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("ai/gemini: marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/v1beta/models/%s:generateContent?key=%s", g.baseURL, g.model, g.apiKey)

	var resp *http.Response
	var lastErr error
	maxRetries := 3
	backoff := 1 * time.Second

	for i := 0; i <= maxRetries; i++ {
		if i > 0 {
			timeSleep(backoff)
			backoff *= 2
		}

		resp, err = g.httpCli.Post(url, "application/json", bytes.NewReader(payload))
		if err != nil {
			lastErr = fmt.Errorf("http post: %w", err)
			continue
		}

		raw, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("read response: %w", err)
			continue
		}

		// Handle HTTP status codes
		if resp.StatusCode != http.StatusOK {
			var geminiResp geminiResponse
			var errMsg string
			if json.Unmarshal(raw, &geminiResp) == nil && geminiResp.Error != nil {
				errMsg = geminiResp.Error.Message
			} else {
				errMsg = string(raw)
			}

			lastErr = fmt.Errorf("api status %d: %s", resp.StatusCode, errMsg)

			// Retry only on 429 (Too Many Requests) or 5xx (Server Errors)
			if resp.StatusCode == http.StatusTooManyRequests || (resp.StatusCode >= 500 && resp.StatusCode <= 599) {
				continue
			}
			// Non-retryable error
			return "", fmt.Errorf("ai/gemini: %w", lastErr)
		}

		var geminiResp geminiResponse
		if err := json.Unmarshal(raw, &geminiResp); err != nil {
			return "", fmt.Errorf("ai/gemini: unmarshal response: %w", err)
		}

		if geminiResp.Error != nil {
			return "", fmt.Errorf("ai/gemini: api error: %s", geminiResp.Error.Message)
		}

		if len(geminiResp.Candidates) == 0 {
			return "", fmt.Errorf("ai/gemini: no candidates returned")
		}

		text := ""
		for _, part := range geminiResp.Candidates[0].Content.Parts {
			text += part.Text
		}
		return strings.TrimSpace(text), nil
	}

	return "", fmt.Errorf("ai/gemini: failed after %d retries: %w", maxRetries, lastErr)
}

func stripMarkdown(raw string) string {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		// Find first newline after opening ```
		if idx := strings.Index(raw, "\n"); idx != -1 {
			raw = raw[idx+1:]
		}
		// Remove trailing ```
		if idx := strings.LastIndex(raw, "```"); idx != -1 {
			raw = raw[:idx]
		}
	}
	return strings.TrimSpace(raw)
}
