import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/site-nav";
import { mockGrowth, mockScores, mockStrengths } from "@/lib/mock";
import { getInterview, scoreOverall, type InterviewSnapshot } from "@/lib/backend";
import { getInterviewId, loadSnapshot, saveSnapshot } from "@/lib/session";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "Evaluation summary · Synapse" },
      { name: "description", content: "Session scorecard, strengths, and growth areas." },
      { property: "og:title", content: "Evaluation summary · Synapse" },
      { property: "og:description", content: "Scorecard, strengths, and growth areas." },
    ],
  }),
  component: Results,
});

function Results() {
  const [snapshot, setSnapshot] = useState<InterviewSnapshot | null>(() => loadSnapshot());

  useEffect(() => {
    const id = getInterviewId();
    if (!id) return;
    getInterview(id)
      .then((fresh) => {
        setSnapshot(fresh);
        saveSnapshot(fresh);
      })
      .catch(() => {});
  }, []);

  const interview = snapshot?.interview;
  const latestScore = interview?.scores?.at(-1);
  const overall = latestScore ? scoreOverall(latestScore) : mockScores.overall;
  const technical = latestScore ? latestScore.technical_depth * 10 : mockScores.technical;
  const communication = latestScore ? latestScore.communication * 10 : mockScores.communication;
  const problemSolving = latestScore ? latestScore.correctness * 10 : mockScores.problemSolving;
  const confidence = latestScore ? latestScore.confidence * 10 : mockScores.confidence;
  const feedback = latestScore?.feedback;

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main className="mx-auto max-w-7xl px-6 py-16">
        <header className="mb-12 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              /report · session a4-2f19
            </p>
            <h1 className="font-display text-4xl font-semibold tracking-tight">Evaluation summary</h1>
            <p className="text-sm text-muted-foreground">
              Candidate: {interview?.candidate_id ?? "Bhinder"} · {interview?.role ?? "Senior Backend Engineer"} role · {interview?.transcript?.length ?? 0} answers
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/interview" className="h-10 rounded-md border border-border bg-card px-5 text-sm font-medium leading-10 hover:bg-muted">
              Replay
            </Link>
            <Link to="/dashboard" className="h-10 rounded-md bg-foreground px-5 text-sm font-medium leading-10 text-background hover:opacity-90">
              Back to dashboard
            </Link>
          </div>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-8">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Overall score
            </p>
            <h3 className="mt-6 font-display text-7xl font-semibold leading-none">{overall}</h3>
            <p className="mt-3 text-xs text-brand">Strong hire</p>
          </div>
          <div className="space-y-6 rounded-xl border border-border bg-card p-6">
            <ScoreRow label="Technical" value={technical} />
            <ScoreRow label="Communication" value={communication} />
          </div>
          <div className="space-y-6 rounded-xl border border-border bg-card p-6">
            <ScoreRow label="Problem solving" value={problemSolving} />
            <ScoreRow label="Confidence" value={confidence} />
          </div>
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-brand/30 bg-brand/5 p-6 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-brand">Recommendation</p>
            <p className="font-display text-lg font-semibold">Ready for on-site</p>
            <button className="mt-2 rounded-md bg-brand px-4 py-2 text-xs font-medium text-brand-foreground">
              Schedule loop
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <ListCard
            label="/strengths"
            title="Primary strengths"
            items={feedback ? [feedback, ...mockStrengths.slice(0, 2)] : mockStrengths}
            dot="bg-brand"
          />
          <ListCard label="/growth" title="Growth areas" items={mockGrowth} dot="bg-signal" />
        </section>
      </main>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="font-mono text-xs text-muted-foreground">{value}%</p>
      </div>
      <p className="font-display text-2xl font-medium">{value}%</p>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-foreground" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ListCard({
  label, title, items, dot,
}: { label: string; title: string; items: string[]; dot: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h4 className="font-display text-lg font-semibold tracking-tight">{title}</h4>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      </div>
      <ul className="space-y-4">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-3 text-sm leading-relaxed">
            <span className={"mt-2 size-1.5 shrink-0 rounded-full " + dot} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
