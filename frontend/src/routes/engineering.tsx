import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EventStream } from "@/components/event-stream";
import { PipelineDiagram } from "@/components/pipeline-diagram";
import { workers } from "@/lib/mock";

export const Route = createFileRoute("/engineering")({
  head: () => ({
    meta: [
      { title: "Judge mode · Synapse architecture" },
      {
        name: "description",
        content: "Live event stream, worker pipeline, and system metrics powering every session.",
      },
      { property: "og:title", content: "Judge mode · Synapse architecture" },
      {
        property: "og:description",
        content: "Live event stream, worker pipeline, and observable metrics.",
      },
    ],
  }),
  component: Engineering,
});

function Engineering() {
  return (
    <div className="min-h-screen bg-cockpit text-cockpit-foreground">
      <nav className="flex items-center justify-between border-b border-cockpit-border px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-6 rounded bg-brand" />
          <span className="text-sm font-semibold tracking-tight">Synapse</span>
          <span className="ml-3 font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
            judge mode
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
            <span className="size-1.5 rounded-full bg-brand animate-pulse" /> live
          </span>
          <Link to="/dashboard" className="rounded-md border border-cockpit-border px-3 py-1.5 text-xs hover:bg-white/5">
            Exit
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-12">
        <header className="mb-12 space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-widest text-brand">/architecture</p>
          <h1 className="max-w-[22ch] font-display text-4xl font-semibold tracking-tight lg:text-5xl">
            What the candidate sees. What's actually happening.
          </h1>
          <p className="max-w-[60ch] text-sm text-cockpit-muted">
            Synapse runs on an event-driven backbone — every transcript chunk, evaluation, and
            score is a message on the bus. This is the operator's view.
          </p>
        </header>

        <section className="mb-10 grid gap-4 md:grid-cols-4">
          <Metric label="Avg latency" seed={142} suffix="ms" />
          <Metric label="Queue depth" seed={2} />
          <Metric label="Events / sec" seed={1200} format="k" />
          <Metric label="Workers" seed={5} suffix=" / 5" />
        </section>

        <section className="mb-10 rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-8">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">Pipeline</h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
              candidate → stt → bus → workers → llm → tts → candidate
            </p>
          </div>
          <PipelineDiagram orientation="horizontal" />
        </section>

        <section className="mb-10">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">Workers</h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
              /pool
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
            {workers.map((w) => (
              <div key={w.name} className="rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-5">
                <div className="flex items-center justify-between">
                  <p className="font-display text-base font-semibold">{w.name}</p>
                  <span className="size-1.5 rounded-full bg-brand animate-pulse" />
                </div>
                <p className="mt-2 text-xs text-cockpit-muted">{w.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-8">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">Event stream</h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
              live · tail -f
            </p>
          </div>
          <div className="max-h-[360px] overflow-y-auto rounded-lg bg-black/40 p-5">
            <EventStream />
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({
  label, seed, suffix, format,
}: { label: string; seed: number; suffix?: string; format?: "k" }) {
  const [n, setN] = useState(seed);
  useEffect(() => {
    const id = setInterval(() => {
      setN((v) => Math.max(1, Math.round(v + (Math.random() - 0.5) * seed * 0.08)));
    }, 1200);
    return () => clearInterval(id);
  }, [seed]);
  const display = format === "k" ? `${(n / 1000).toFixed(1)}k` : n.toString();
  return (
    <div className="rounded-xl border border-cockpit-border bg-cockpit-panel/50 p-6">
      <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">{label}</p>
      <p className="mt-3 font-display text-3xl font-semibold text-cockpit-foreground">
        {display}{suffix ?? ""}
      </p>
    </div>
  );
}
