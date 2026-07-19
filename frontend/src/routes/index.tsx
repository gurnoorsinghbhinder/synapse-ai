import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/site-nav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Synapse — the event-driven AI reasoning platform" },
      {
        name: "description",
        content:
          "Autonomous AI engine that understands architecture as deeply as your senior staff. Resume-aware, real-time, fully observable.",
      },
      { property: "og:title", content: "Synapse — event-driven AI reasoning" },
      {
        property: "og:description",
        content: "Real-time AI reasoning engine with a live event stream and observable scoring.",
      },
    ],
  }),
  component: Landing,
});

const stats = [
  { label: "Latency", value: "140ms STT/TTS" },
  { label: "Intelligence", value: "Llama 3.1 70B" },
  { label: "Context", value: "Full PDF Parsing" },
  { label: "Feedback", value: "Live Scoring" },
  { label: "Engine", value: "Kafka Pipeline" },
];

const features = [
  { k: "01", title: "Real-time AI Interview", body: "Streaming STT and TTS keep the conversation under 150ms end-to-end." },
  { k: "02", title: "Resume-aware Questions", body: "Every question is grounded in embeddings drawn from the candidate's own work." },
  { k: "03", title: "Adaptive Questioning", body: "Difficulty ratchets up when signal is strong, digs deeper when it stalls." },
  { k: "04", title: "Live Analytics", body: "Per-answer scoring, sentiment, and technical density surface as they happen." },
  { k: "05", title: "Backend Architecture", body: "Fully event-driven — Kafka bus, worker pool, vector store, observable end-to-end." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />

      <section className="relative overflow-hidden border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:py-32">
          <div className="flex flex-col gap-10">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-muted px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground ring-1 ring-black/5">
              <span className="size-1.5 rounded-full bg-brand" /> v1.0.4 · production ready
            </span>
            <h1 className="max-w-[20ch] font-display text-5xl font-semibold leading-[0.95] tracking-tight text-balance lg:text-7xl">
              Synapse: the event-driven reasoning engine.
            </h1>
            <p className="max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
              Scale your technical screening with an autonomous interviewer that understands
              architecture as deeply as your senior staff. Resume-aware, real-time, and fully
              observable.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex h-11 items-center rounded-md bg-foreground px-6 text-sm font-medium text-background ring-1 ring-foreground transition-transform hover:opacity-90 active:scale-95"
              >
                Start Interview
              </Link>
              <Link
                to="/engineering"
                className="inline-flex h-11 items-center rounded-md bg-card px-6 text-sm font-medium text-foreground ring-1 ring-black/5 transition-transform hover:bg-muted active:scale-95"
              >
                Watch Demo
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-8 border-t border-border pt-10 md:grid-cols-5">
              {stats.map((s) => (
                <div key={s.label} className="space-y-1">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="text-sm font-medium">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-12 flex flex-col gap-2">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              /features
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-tight lg:text-4xl">
              Engineered to feel less like a chatbot, more like a system.
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.k} className="flex flex-col gap-4 bg-card p-8">
                <p className="font-mono text-[11px] tracking-widest text-brand">{f.k}</p>
                <h3 className="font-display text-xl font-semibold tracking-tight">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
            <div className="flex flex-col justify-between gap-4 bg-cockpit p-8 text-cockpit-foreground">
              <p className="font-mono text-[11px] tracking-widest text-brand">→</p>
              <h3 className="font-display text-xl font-semibold tracking-tight">
                See the architecture live.
              </h3>
              <Link
                to="/engineering"
                className="inline-flex w-fit items-center rounded-md bg-brand px-4 py-2 text-xs font-medium text-brand-foreground"
              >
                Open judge mode
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-10">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded bg-foreground" />
            <span className="text-sm font-semibold tracking-tight">Synapse</span>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            system status: optimal · 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
