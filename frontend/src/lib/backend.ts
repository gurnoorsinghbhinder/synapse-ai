const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";
const WS_BASE =
  import.meta.env.VITE_WS_BASE_URL ??
  API_BASE.replace(/^http/, "ws");

export type EventType =
  | "InterviewStarted"
  | "InterviewFinished"
  | "ResumeUploaded"
  | "ResumeLoaded"
  | "QuestionAsked"
  | "TranscriptChunk"
  | "TranscriptCompleted"
  | "AnswerEvaluated"
  | "QuestionGenerated"
  | "MetricsUpdated"
  | "TimelineUpdated";

export type BackendEvent = {
  id: string;
  interview_id: string;
  type: EventType;
  topic: string;
  timestamp: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, string>;
};

export type Candidate = {
  id: string;
  name: string;
  email: string;
  resume_text: string;
  created_at: string;
};

export type Score = {
  technical_depth: number;
  correctness: number;
  communication: number;
  confidence: number;
  feedback: string;
  at: string;
};

export type Transcript = {
  question: string;
  answer: string;
  at: string;
};

export type Interview = {
  id: string;
  candidate_id: string;
  role: string;
  status: "created" | "in_progress" | "finished";
  current_question: string;
  question_number: number;
  question_buffer: string[] | null;
  scores: Score[] | null;
  transcript: Transcript[] | null;
  started_at: string;
  ended_at?: string;
};

export type QuestionPrediction = {
  question: string;
  buffer: string[];
  topic: string;
  difficulty: string;
  strategy: string;
  signals: string[];
  topic_shift: boolean;
};

export function predictionFromEvent(event: BackendEvent): QuestionPrediction | null {
  if (event.type !== "QuestionGenerated") return null;
  const payload = event.payload ?? {};
  return {
    question: typeof payload.question === "string" ? payload.question : "",
    buffer: Array.isArray(payload.buffer) ? (payload.buffer as string[]) : [],
    topic: typeof payload.topic === "string" ? payload.topic : "",
    difficulty: typeof payload.difficulty === "string" ? payload.difficulty : "",
    strategy: typeof payload.strategy === "string" ? payload.strategy : "",
    signals: Array.isArray(payload.signals) ? (payload.signals as string[]) : [],
    topic_shift: Boolean(payload.topic_shift),
  };
}

export type InterviewSnapshot = {
  interview: Interview;
  timeline: BackendEvent[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Backend request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function uploadResume(input: {
  name: string;
  email?: string;
  resumeText: string;
}) {
  return request<{ candidate: Candidate; event: BackendEvent }>("/resume/upload", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email ?? "",
      resume_text: input.resumeText,
    }),
  });
}

export function startInterview(input: { candidateId: string; role: string }) {
  return request<Interview>("/interview/start", {
    method: "POST",
    body: JSON.stringify({
      candidate_id: input.candidateId,
      role: input.role,
    }),
  });
}

export function endInterview(interviewId: string) {
  return request<Interview>("/interview/end", {
    method: "POST",
    body: JSON.stringify({ interview_id: interviewId }),
  });
}

export function getInterview(interviewId: string) {
  return request<InterviewSnapshot>(`/interview/${interviewId}`);
}

export function submitTranscript(interviewId: string, text: string) {
  return request<Interview>(`/interview/${interviewId}/transcript`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function interviewEventsURL(interviewId: string) {
  return `${WS_BASE}/ws?interview_id=${encodeURIComponent(interviewId)}`;
}

export function scoreOverall(score?: Score) {
  if (!score) return 0;
  return Math.round(
    ((score.technical_depth + score.correctness + score.communication + score.confidence) / 40) *
      100,
  );
}
