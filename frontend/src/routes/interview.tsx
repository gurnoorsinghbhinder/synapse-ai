import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { ArchitectureDrawer } from "@/components/architecture-drawer";
import { ScoreBar } from "@/components/score-bar";
import {
  endInterview,
  getInterview,
  interviewEventsURL,
  predictionFromEvent,
  scoreOverall,
  submitTranscript,
  type BackendEvent,
  type Interview,
  type QuestionPrediction,
} from "@/lib/backend";
import { getInterviewId, saveSnapshot } from "@/lib/session";
import { AudioStream, type AudioStreamStatus } from "@/lib/audio-stream";

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
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("Connecting to backend...");
  const [submitting, setSubmitting] = useState(false);
  const [prediction, setPrediction] = useState<QuestionPrediction | null>(null);

  // Audio streaming state (MediaRecorder + backend WebSocket STT)
  const audioStreamRef = useRef<AudioStream | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [audioConnected, setAudioConnected] = useState(false);
  const [voiceNarration, setVoiceNarration] = useState(true);

  const chatContainerRef = useRef<HTMLDivElement>(null);

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

  // Create AudioStream lazily — only when user clicks "Voice answer".
  // This avoids race conditions with interview ID loading.
  const ensureAudioStream = (): AudioStream | null => {
    let stream = audioStreamRef.current;
    if (stream) return stream;

    const id = interviewId;
    if (!id) {
      setSpeechError("No active interview session. Start an interview first.");
      return null;
    }

    stream = new AudioStream(id, {
      onInterimTranscript: (text: string) => {
        setAnswer(text);
      },
      onFinalTranscript: (text: string) => {
        setAnswer(text);
      },
      onStatusChange: (status: AudioStreamStatus) => {
        setIsListening(status.listening);
        setAudioConnected(status.connected);
        if (!status.connected && status.listening) {
          setSpeechError("Audio server connection lost. Trying to reconnect...");
        } else if (status.connected) {
          setSpeechError("");
        }
      },
      onError: (error: string) => {
        setSpeechError(error);
        setIsListening(false);
      },
    });

    audioStreamRef.current = stream;
    return stream;
  };

  // Auto-scroll chat thread to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [interview?.transcript, interview?.current_question]);

  // Voice Narration (Browser Native Text-To-Speech)
  useEffect(() => {
    if (voiceNarration && interview?.current_question) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel(); // Stop current speech
        const utterance = new SpeechSynthesisUtterance(interview.current_question);
        
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => 
          (v.name.includes("Google") || v.name.includes("Natural")) && v.lang.startsWith("en")
        ) || voices.find(v => v.lang.startsWith("en"));
        
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
        window.speechSynthesis.speak(utterance);
      }
    }

    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [interview?.current_question, voiceNarration]);

  // Load interview details & establish events socket
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
        const seeded = snapshot.timeline
          ?.filter((e) => e.type === "QuestionGenerated")
          .at(-1);
        if (seeded) setPrediction(predictionFromEvent(seeded));
        saveSnapshot(snapshot);
        setStatus("Backend session active");
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Could not load interview";
        setStatus(msg);
        if (msg.includes("not found") || msg.includes("404")) {
          localStorage.removeItem("synapse.interview_id");
          setTimeout(() => {
            nav({ to: "/dashboard" });
          }, 1500);
        }
      });

    const socket = new WebSocket(interviewEventsURL(id));
    socket.onopen = () => setStatus("WebSocket stream healthy");
    socket.onerror = () => setStatus("WebSocket stream interrupted");
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as BackendEvent;
      setEvents((prev) => [...prev, event].slice(-80));
      const next = predictionFromEvent(event);
      if (next) setPrediction(next);

      if (
        event.type === "QuestionAsked" ||
        event.type === "AnswerEvaluated" ||
        event.type === "QuestionGenerated" ||
        event.type === "InterviewFinished"
      ) {
        void getInterview(id).then((snapshot) => {
          setInterview(snapshot.interview);
          saveSnapshot(snapshot);
        });
      }
    };

    return () => {
      cancelled = true;
      socket.close();
      if (audioStreamRef.current) {
        audioStreamRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
    const stream = ensureAudioStream();
    if (!stream) return;

    if (isListening) {
      stream.stop();
    } else {
      void stream.start();
    }
  };

  async function submitAnswer() {
    if (!interviewId || !answer.trim()) return;
    
    const prevQNum = interview?.question_number ?? 0;

    // Turn off listening if active
    if (isListening && audioStreamRef.current) {
      audioStreamRef.current.stop();
    }

    setSubmitting(true);
    setStatus("Publishing candidate answer...");
    try {
      const updated = await submitTranscript(interviewId, answer.trim());
      setInterview(updated);
      setAnswer("");
      setStatus("Answer submitted. Evaluating score...");
      
      // Auto-poll fallback to force-fetch updates (resolves socket connectivity lags)
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const snapshot = await getInterview(interviewId);
          if (snapshot.interview.question_number > prevQNum || attempts > 6) {
            clearInterval(interval);
            setInterview(snapshot.interview);
            setEvents(snapshot.timeline ?? []);
            saveSnapshot(snapshot);
            setStatus("Next question ready.");
          }
        } catch (e) {
          if (attempts > 6) clearInterval(interval);
        }
      }, 1000);

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
  const overall = scoreOverall(latestScore);

  return (
    <div className="min-h-screen bg-cockpit text-cockpit-foreground">
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
          <section className="lg:col-span-8">
            <div className="rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-8 flex flex-col">
              
              {/* Header */}
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative flex size-12 items-center justify-center rounded-full bg-white/5 ring-1 ring-cockpit-border">
                    <span className="absolute inset-0 rounded-full ring-2 ring-brand/40 animate-pulse-ring" />
                    <span className="size-2.5 rounded-full bg-brand" />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">Active Session</p>
                    <p className="font-medium">AI Technical Lead</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">Progress</p>
                    <p className="font-medium">Q{interview?.question_number ?? 0} / 10</p>
                  </div>
                  <button onClick={() => void finishInterview()} className="h-9 rounded-md bg-destructive/15 px-4 text-xs font-medium text-destructive ring-1 ring-destructive/30 hover:bg-destructive/20">End interview</button>
                </div>
              </div>

              {/* Chat Thread Container */}
              <div 
                ref={chatContainerRef}
                className="mb-6 h-[400px] overflow-y-auto rounded-lg border border-cockpit-border bg-black/20 p-4 space-y-6 scroll-smooth"
              >
                {/* Initial Welcome */}
                <div className="flex gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-bold text-xs ring-1 ring-brand/20">AI</div>
                  <div className="rounded-lg bg-cockpit-panel border border-cockpit-border p-3.5 text-sm text-cockpit-foreground/90 max-w-[80%] leading-relaxed">
                    Hello! Welcome to your AI Technical Lead interview. I have parsed your resume profile. Let's begin the evaluation session.
                  </div>
                </div>

                {/* Question and Answer History */}
                {interview?.transcript?.map((turn, i) => (
                  <div key={i} className="space-y-6">
                    {/* Interviewer Question */}
                    <div className="flex gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-bold text-xs ring-1 ring-brand/20">AI</div>
                      <div className="rounded-lg bg-cockpit-panel border border-cockpit-border p-3.5 text-sm text-cockpit-foreground/90 max-w-[80%] leading-relaxed">
                        {turn.question}
                      </div>
                    </div>
                    
                    {/* Candidate Answer */}
                    <div className="flex gap-3 justify-end">
                      <div className="rounded-lg bg-brand/20 border border-brand/30 p-3.5 text-sm text-cockpit-foreground/90 max-w-[80%] leading-relaxed">
                        {turn.answer}
                      </div>
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground font-bold text-xs">U</div>
                    </div>
                  </div>
                ))}

                {/* Active Question Bubble */}
                {interview?.current_question && (
                  <div className="flex gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand font-bold text-xs ring-1 ring-brand/20">AI</div>
                    <div className="rounded-lg bg-cockpit-panel border border-cockpit-border p-3.5 text-sm text-cockpit-foreground/90 max-w-[80%] leading-relaxed">
                      {interview.current_question}
                      <span className="ml-1 inline-block h-3.5 w-1 bg-brand animate-pulse" />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input controls */}
              <div className="space-y-3">
                <textarea 
                  value={answer} 
                  onChange={(e) => setAnswer(e.target.value)} 
                  rows={3} 
                  className="w-full resize-none rounded-lg border border-cockpit-border bg-black/20 px-4 py-3 text-sm leading-relaxed text-cockpit-foreground outline-none placeholder:text-cockpit-muted focus:border-brand"
                  placeholder={isListening ? "Listening... Speak clearly into your microphone." : "Type your answer here, or click voice answer to speak..."}
                />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={toggleListening}
                      className={`flex h-10 items-center gap-2 rounded-md px-4 text-xs font-medium transition-all ${
                        isListening 
                          ? "bg-destructive text-destructive-foreground animate-pulse" 
                          : "bg-brand/20 text-brand border border-brand/30 hover:bg-brand/35"
                      }`}
                    >
                      <span className={`size-2 rounded-full ${isListening ? "bg-white" : "bg-brand"}`} />
                      {isListening ? "Stop listening" : "Voice answer"}
                    </button>

                    <label className="flex items-center gap-2 text-xs text-cockpit-muted cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={voiceNarration}
                        onChange={(e) => setVoiceNarration(e.target.checked)}
                        className="rounded border-cockpit-border bg-black/20 text-brand focus:ring-0 focus:ring-offset-0"
                      />
                      Voice Narration
                    </label>
                  </div>

                  <button 
                    onClick={() => void submitAnswer()} 
                    disabled={!interviewId || submitting || !answer.trim()} 
                    className="h-10 rounded-md bg-brand px-5 text-xs font-medium text-brand-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Sending..." : "Submit Answer"}
                  </button>
                </div>

                {speechError && (
                  <p className="text-[11px] text-destructive/80 font-mono mt-2">{speechError}</p>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6 lg:col-span-4">
            <div className="space-y-6 rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">Real-time score</p>
                <p className="mt-1 font-display text-5xl font-semibold text-brand">{overall || "--"}<span className="text-lg text-cockpit-muted">/100</span></p>
              </div>
              <div className="space-y-4">
                <ScoreBar label="TECHNICAL DEPTH" value={(latestScore?.technical_depth ?? 0) * 10} />
                <ScoreBar label="COMMUNICATION" value={(latestScore?.communication ?? 0) * 10} />
                <ScoreBar label="CONFIDENCE" value={(latestScore?.confidence ?? 0) * 10} tone="signal" />
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-brand/20 to-transparent p-px">
              <button onClick={() => setDrawerOpen(true)} className="flex w-full items-center justify-between rounded-[11px] bg-cockpit-panel px-6 py-4 ring-1 ring-cockpit-border transition-colors hover:bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded bg-white/5">
                    <svg viewBox="0 0 16 16" className="size-4 text-brand" fill="currentColor">
                      <path d="M1 3.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5ZM1 6.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5ZM1 9.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5ZM1 12.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1-.5-.5Z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium">Live Architecture</span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">⌘ K</span>
              </button>
            </div>

            <div className="rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-6">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">Question queue</p>
              <ol className="space-y-2 font-mono text-xs">
                {(interview?.question_buffer?.length ? interview.question_buffer : [interview?.current_question ?? "Waiting for first question"]).map((item, index) => (
                  <li key={`${item}-${index}`} className={index === 0 ? "flex justify-between text-brand" : "flex justify-between text-cockpit-muted"}>
                    <span className="truncate max-w-[90%]">{String(index + 1).padStart(2, "0")} · {item}</span><span>{index === 0 ? "●" : "—"}</span>
                  </li>
                ))}
              </ol>
            </div>

            {prediction && (
              <div className="rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-6">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">Prediction Engine</p>
                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-cockpit-muted">Topic</span>
                    <span className="text-brand">{prediction.topic}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cockpit-muted">Strategy</span>
                    <span>{prediction.strategy}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cockpit-muted">Difficulty</span>
                    <span>{prediction.difficulty}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cockpit-muted">Topic Shift</span>
                    <span>{prediction.topic_shift ? "Yes" : "No"}</span>
                  </div>
                  {prediction.signals.length > 0 && (
                    <div className="pt-2 border-t border-cockpit-border">
                      <span className="text-cockpit-muted">Signals</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {prediction.signals.map((s) => (
                          <span key={s} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-cockpit-muted">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="pt-2 text-[10px] text-cockpit-muted/60 truncate" title={prediction.question}>Next: {prediction.question}</div>
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>

      <ArchitectureDrawer open={drawerOpen} onOpenChange={setDrawerOpen} interviewId={interviewId} events={events} />
    </div>
  );
}