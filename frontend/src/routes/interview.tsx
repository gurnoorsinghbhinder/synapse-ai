import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArchitectureDrawer } from "@/components/architecture-drawer";
import { ScoreBar } from "@/components/score-bar";
import {
  endInterview,
  getInterview,
  interviewEventsURL,
  scoreOverall,
  submitTranscript,
  type BackendEvent,
  type Interview,
} from "@/lib/backend";
import { getInterviewId, saveSnapshot } from "@/lib/session";

export const Route = createFileRoute("/interview")({
  head: () => ({
    meta: [
      { title: "Live session · Synapse" },
      { name: "description", content: "You're in a live AI reasoning session." },
      { property: "og:title", content: "Live session · Synapse" },
      { property: "og:description", content: "Live AI session with real-time scoring." },
    ],
  }),
  component: InterviewRoom,
});

function InterviewRoom() {
  const nav = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [interviewId, setInterviewIdState] = useState<string | null>(null);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [events, setEvents] = useState<BackendEvent[]>([]);
  const [answer, setAnswer] = useState(
    "I designed the event contracts first, then built an orchestrator that publishes immutable events. The tradeoff was accepting eventual consistency so question generation and scoring could run in parallel without blocking the live interview.",
  );
  const [status, setStatus] = useState("Connecting to backend...");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setDrawerOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const id = getInterviewId();
    setInterviewIdState(id);
    if (!id) {
      setStatus("No active interview. Start one from the dashboard.");
      return;
    }

    let cancelled = false;
    getInterview(id)
      .then((snapshot) => {
        if (cancelled) return;
        setInterview(snapshot.interview);
        setEvents(snapshot.timeline ?? []);
        saveSnapshot(snapshot);
        setStatus("Backend session active");
      })
      .catch((err) => setStatus(err instanceof Error ? err.message : "Could not load interview"));

    const socket = new WebSocket(interviewEventsURL(id));
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as BackendEvent;
      setEvents((prev) => [...prev, event].slice(-80));
      if (
        event.type === "QuestionAsked" ||
        event.type === "AnswerEvaluated" ||
        event.type === "QuestionGenerated" ||
        event.type === "InterviewFinished"
      ) {
        getInterview(id)
          .then((snapshot) => {
            setInterview(snapshot.interview);
            saveSnapshot(snapshot);
          })
          .catch(() => {});
      }
    };
    socket.onopen = () => setStatus("WebSocket stream healthy");
    socket.onerror = () => setStatus("WebSocket stream interrupted");

    return () => {
      cancelled = true;
      socket.close();
    };
  }, []);

  async function submitAnswer() {
    if (!interviewId || !answer.trim()) return;
    setSubmitting(true);
    setStatus("Publishing TranscriptCompleted...");
    try {
      const updated = await submitTranscript(interviewId, answer.trim());
      setInterview(updated);
      setAnswer("");
      setStatus("Transcript published. Workers are evaluating in parallel.");
      const snapshot = await getInterview(interviewId);
      setInterview(snapshot.interview);
      setEvents(snapshot.timeline ?? []);
      saveSnapshot(snapshot);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not submit answer");
    } finally {
      setSubmitting(false);
    }
  }

  async function finishInterview() {
    if (!interviewId) {
      nav({ to: "/results" });
      return;
    }
    try {
      const ended = await endInterview(interviewId);
      setInterview(ended);
      const snapshot = await getInterview(interviewId);
      saveSnapshot(snapshot);
      nav({ to: "/results" });
    } catch {
      nav({ to: "/results" });
    }
  }

  const latestScore = interview?.scores?.at(-1);
  const currentTranscript = interview?.transcript?.at(-1)?.answer ?? "Waiting for the candidate's next answer...";
  const overall = scoreOverall(latestScore);

  return (
    <div className="min-h-screen bg-cockpit text-cockpit-foreground">
      {/* Minimal cockpit nav */}
      <nav className="flex items-center justify-between border-b border-cockpit-border px-6 py-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="size-6 rounded bg-brand" />
          <span className="text-sm font-semibold tracking-tight">Synapse</span>
          <span className="ml-3 font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
            session · {interview?.id ?? "pending"}
          </span>
        </Link>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-brand animate-pulse" /> {status}
          </span>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Console */}
          <section className="lg:col-span-8">
            <div className="rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-8">
              <div className="mb-12 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative flex size-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-cockpit-border">
                    <span className="absolute inset-0 rounded-full ring-2 ring-brand/40 animate-pulse-ring" />
                    <span className="size-2.5 rounded-full bg-brand" />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
                      Active Session
                    </p>
                    <p className="font-medium">AI Technical Lead</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
                      Progress
                    </p>
                    <p className="font-medium">Q{interview?.question_number ?? 0} / 10</p>
                  </div>
                  <button
                    onClick={() => void finishInterview()}
                    className="h-9 rounded-md bg-destructive/15 px-4 text-xs font-medium text-destructive ring-1 ring-destructive/30 hover:bg-destructive/20"
                  >
                    End interview
                  </button>
                </div>
              </div>

              <div className="mb-12 min-h-[280px] space-y-10">
                <div className="space-y-3">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-brand">
                    Interviewer
                  </span>
                  <p className="max-w-[38ch] font-display text-3xl leading-tight text-cockpit-foreground text-balance">
                    "{interview?.current_question ?? "Start an interview from the dashboard to load the first question."}"
                  </p>
                </div>

                <div className="space-y-3 opacity-70">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-cockpit-muted">
                    Candidate transcript
                  </span>
                  <p className="text-base leading-relaxed text-cockpit-foreground/80">
                    {currentTranscript}
                    <span className="ml-1 inline-block h-4 w-[2px] translate-y-0.5 bg-brand animate-pulse" />
                  </p>
                </div>
              </div>

              <div className="mb-6 space-y-3">
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-cockpit-border bg-black/20 px-4 py-3 text-sm leading-relaxed text-cockpit-foreground outline-none placeholder:text-cockpit-muted focus:border-brand"
                  placeholder="Type a candidate answer, then publish it as TranscriptCompleted."
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => void submitAnswer()}
                    disabled={!interviewId || submitting || !answer.trim()}
                    className="h-10 rounded-md bg-brand px-5 text-xs font-medium text-brand-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Publishing..." : "Submit answer"}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-6 border-t border-cockpit-border pt-6">
                <div className="flex h-6 items-end gap-1">
                  <span className="w-1 h-3 rounded-sm bg-brand/40 animate-wave" style={{ animationDelay: "0s" }} />
                  <span className="w-1 h-6 rounded-sm bg-brand animate-wave" style={{ animationDelay: "0.15s" }} />
                  <span className="w-1 h-4 rounded-sm bg-brand/60 animate-wave" style={{ animationDelay: "0.3s" }} />
                  <span className="w-1 h-5 rounded-sm bg-brand/80 animate-wave" style={{ animationDelay: "0.05s" }} />
                  <span className="w-1 h-2 rounded-sm bg-brand/30 animate-wave" style={{ animationDelay: "0.25s" }} />
                </div>
                <p className="font-mono text-xs uppercase tracking-widest text-cockpit-muted">
                  Listening for input...
                </p>
              </div>
            </div>
          </section>

          {/* Telemetry */}
          <aside className="space-y-6 lg:col-span-4">
            <div className="space-y-6 rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
                  Real-time score
                </p>
                <p className="mt-1 font-display text-5xl font-semibold text-brand">
                  {overall || "--"}<span className="text-lg text-cockpit-muted">/100</span>
                </p>
              </div>
              <div className="space-y-4">
                <ScoreBar label="TECHNICAL DEPTH" value={(latestScore?.technical_depth ?? 0) * 10} />
                <ScoreBar label="COMMUNICATION" value={(latestScore?.communication ?? 0) * 10} />
                <ScoreBar label="CONFIDENCE" value={(latestScore?.confidence ?? 0) * 10} tone="signal" />
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-brand/20 to-transparent p-px">
              <button
                onClick={() => setDrawerOpen(true)}
                className="flex w-full items-center justify-between rounded-[11px] bg-cockpit-panel px-6 py-4 ring-1 ring-cockpit-border transition-colors hover:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded bg-white/5">
                    <svg viewBox="0 0 16 16" className="size-4 text-brand" fill="currentColor">
                      <path d="M1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5ZM1 6.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5ZM1 9.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5ZM1 12.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5Z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium">Live Architecture</span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
                  ⌘ K
                </span>
              </button>
            </div>

            <div className="rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-6">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
                Question queue
              </p>
              <ol className="space-y-2 font-mono text-xs">
                {(interview?.question_buffer?.length ? interview.question_buffer : [interview?.current_question ?? "Waiting for first question"]).map((item, index) => (
                  <li key={`${item}-${index}`} className={index === 0 ? "flex justify-between text-brand" : "flex justify-between text-cockpit-muted"}>
                    <span>{String(index + 1).padStart(2, "0")} · {item}</span><span>{index === 0 ? "●" : "—"}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </main>

      <ArchitectureDrawer open={drawerOpen} onOpenChange={setDrawerOpen} interviewId={interviewId} events={events} />
    </div>
  );
}
