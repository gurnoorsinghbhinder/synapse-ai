export const mockUser = { name: "Bhinder", role: "Senior Backend Engineer" };

export const mockSkills = [
  "Go", "Kafka", "Kubernetes", "MongoDB", "AWS", "gRPC", "Postgres", "Redis",
];

export const mockProjects = [
  { name: "Event-sourced payments pipeline", stack: "Go · Kafka · Postgres", impact: "50k events/sec at p99 42ms" },
  { name: "Multi-region config service", stack: "Go · etcd · K8s", impact: "sub-100ms failover across 3 regions" },
];

export const mockExperience = [
  { role: "Staff Engineer", company: "Northpeak", years: "2022 — Now" },
  { role: "Backend Engineer", company: "Loomstack", years: "2019 — 2022" },
];

export const mockInterviews = [
  { date: "Nov 12", role: "Senior Backend", score: 86 },
  { date: "Nov 04", role: "Platform Engineer", score: 78 },
  { date: "Oct 21", role: "Distributed Systems", score: 82 },
];

export const mockScores = {
  overall: 86,
  technical: 92,
  communication: 80,
  problemSolving: 88,
  confidence: 85,
};

export const mockStrengths = [
  "Deep understanding of Kafka consumer groups and offset management",
  "Clear articulation of microservices trade-offs",
  "Strong grasp of Go concurrency patterns",
];

export const mockGrowth = [
  "Distributed caching strategies (Redis / Memcached)",
  "Complex retry logic in asynchronous pipelines",
  "Kubernetes ingress controller configuration",
];

export type PipelineEvent = {
  ts: string;
  type: string;
  detail: string;
  tone?: "brand" | "signal" | "muted";
};

export const seedEvents: PipelineEvent[] = [
  { ts: "14:20:01", type: "TranscriptChunk", detail: '"scaled Kafka consumers..."', tone: "brand" },
  { ts: "14:20:02", type: "Worker_Eval", detail: "Evaluating semantic depth", tone: "brand" },
  { ts: "14:20:03", type: "ScoreUpdated", detail: "Technical +1.2", tone: "signal" },
  { ts: "14:20:04", type: "QueueBuffered", detail: "Waiting for TTS...", tone: "muted" },
  { ts: "14:20:05", type: "LLM_StreamChunk", detail: "token: partition-key", tone: "brand" },
  { ts: "14:20:06", type: "VectorSearch", detail: "cosine_sim = 0.89", tone: "brand" },
  { ts: "14:20:07", type: "TTS_Emit", detail: "chunk 3 / 8 delivered", tone: "muted" },
  { ts: "14:20:08", type: "ScoreUpdated", detail: "Communication +0.8", tone: "signal" },
];

export const pipelineStages = [
  { id: "candidate", label: "Candidate", kind: "io" },
  { id: "stt", label: "STT Node", kind: "worker" },
  { id: "bus", label: "Event Bus", kind: "core" },
  { id: "workers", label: "Workers", kind: "worker" },
  { id: "llm", label: "LLM Reasoning", kind: "core" },
  { id: "tts", label: "TTS", kind: "worker" },
  { id: "candidateOut", label: "Candidate", kind: "io" },
] as const;

export const workers = [
  { name: "Transcript", desc: "Streams audio → text chunks" },
  { name: "Question", desc: "Selects next question from context" },
  { name: "Scoring", desc: "Evaluates answer depth in-flight" },
  { name: "Resume", desc: "Semantic lookup over profile embeddings" },
  { name: "Analytics", desc: "Emits KPIs to dashboard" },
];
