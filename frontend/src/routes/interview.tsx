import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArchitectureDrawer } from "@/components/architecture-drawer";
import { ScoreBar } from "@/components/score-bar";

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

const question =
  "Walk me through your experience scaling Kafka consumers for high-throughput event streams.";
const transcript =
  "In my last project, we handled 50k events/sec. We used partition-key strategies to ensure order while maintaining rebalance safety, then batched writes into Postgres via a small worker pool...";

function InterviewRoom() {
  const nav = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  return (
    <div className="min-h-screen bg-cockpit text-cockpit-foreground">
      {/* Minimal cockpit nav */}
      <nav className="flex items-center justify-between border-b border-cockpit-border px-6 py-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="size-6 rounded bg-brand" />
          <span className="text-sm font-semibold tracking-tight">Synapse</span>
          <span className="ml-3 font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
            session · a4-2f19
          </span>
        </Link>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-brand animate-pulse" /> stream healthy
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
                    <p className="font-medium">Q3 / 10</p>
                  </div>
                  <button
                    onClick={() => nav({ to: "/results" })}
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
                    "{question}"
                  </p>
                </div>

                <div className="space-y-3 opacity-70">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-cockpit-muted">
                    Candidate transcript
                  </span>
                  <p className="text-base leading-relaxed text-cockpit-foreground/80">
                    {transcript}
                    <span className="ml-1 inline-block h-4 w-[2px] translate-y-0.5 bg-brand animate-pulse" />
                  </p>
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
                  82<span className="text-lg text-cockpit-muted">/100</span>
                </p>
              </div>
              <div className="space-y-4">
                <ScoreBar label="TECHNICAL DEPTH" value={88} />
                <ScoreBar label="COMMUNICATION" value={74} />
                <ScoreBar label="PROBLEM SOLVING" value={81} tone="signal" />
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
                <li className="flex justify-between text-cockpit-foreground/50 line-through">
                  <span>01 · Kafka consumer basics</span><span>✓</span>
                </li>
                <li className="flex justify-between text-cockpit-foreground/50 line-through">
                  <span>02 · Partition strategy</span><span>✓</span>
                </li>
                <li className="flex justify-between text-brand">
                  <span>03 · High-throughput scaling</span><span>●</span>
                </li>
                <li className="flex justify-between text-cockpit-muted">
                  <span>04 · Retry semantics</span><span>—</span>
                </li>
                <li className="flex justify-between text-cockpit-muted">
                  <span>05 · Caching layer</span><span>—</span>
                </li>
              </ol>
            </div>
          </aside>
        </div>
      </main>

      <ArchitectureDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
