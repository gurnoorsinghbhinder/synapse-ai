import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteNav } from "@/components/site-nav";
import { mockExperience, mockProjects, mockSkills } from "@/lib/mock";
import { UploadCloud, FileText, Check } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/resume")({
  head: () => ({
    meta: [
      { title: "Resume · Synapse" },
      { name: "description", content: "Upload your resume — it becomes the ground truth for every session." },
      { property: "og:title", content: "Resume · Synapse" },
      { property: "og:description", content: "Resume-aware sessions start here." },
    ],
  }),
  component: ResumePage,
});

function ResumePage() {
  const nav = useNavigate();
  const [parsed, setParsed] = useState(true);
  const [drag, setDrag] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <header className="mb-12 space-y-3">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            /resume
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Your profile</h1>
          <p className="max-w-[60ch] text-sm text-muted-foreground">
            Your resume is parsed into structured skills + vector embeddings. The interviewer draws
            questions directly from this — accuracy matters.
          </p>
        </header>

        <section className="mb-12">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); setParsed(true); }}
            className={
              "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 text-center transition-colors " +
              (drag ? "border-brand bg-brand/5" : "border-border bg-card")
            }
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <UploadCloud className="size-5" />
            </div>
            <div>
              <p className="font-medium">Drop your resume PDF here</p>
              <p className="text-xs text-muted-foreground">Max 5 MB · PDF or DOCX</p>
            </div>
            <button
              onClick={() => setParsed(true)}
              className="mt-2 inline-flex h-9 items-center rounded-md bg-foreground px-4 text-xs font-medium text-background hover:opacity-90"
            >
              Choose file
            </button>
          </div>
          {parsed && (
            <div className="mt-4 flex items-center gap-3 rounded-md border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
              <div className="flex size-6 items-center justify-center rounded-full bg-brand text-brand-foreground">
                <Check className="size-3.5" />
              </div>
              <div className="flex-1">
                <p className="font-medium">bhinder_resume_v4.pdf</p>
                <p className="text-xs text-muted-foreground">Parsed · 8 skills · 2 projects · 2 roles · embeddings synced</p>
              </div>
              <FileText className="size-4 text-muted-foreground" />
            </div>
          )}
        </section>

        <section className="mb-10">
          <SectionHeader label="/skills" title="Extracted skills" />
          <div className="flex flex-wrap gap-2">
            {mockSkills.map((s) => (
              <span
                key={s}
                className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-[11px] tracking-tight"
              >
                {s}
              </span>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <SectionHeader label="/projects" title="Projects" />
          <div className="grid gap-3 md:grid-cols-2">
            {mockProjects.map((p) => (
              <div key={p.name} className="rounded-xl border border-border bg-card p-5">
                <p className="font-display text-base font-semibold">{p.name}</p>
                <p className="mt-1 font-mono text-[11px] text-brand">{p.stack}</p>
                <p className="mt-3 text-xs text-muted-foreground">{p.impact}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <SectionHeader label="/experience" title="Experience" />
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {mockExperience.map((e) => (
              <div key={e.role} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="font-medium">{e.role}</p>
                  <p className="text-xs text-muted-foreground">{e.company}</p>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{e.years}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <button
            onClick={() => nav({ to: "/dashboard" })}
            className="h-11 rounded-md border border-border bg-card px-6 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => nav({ to: "/dashboard" })}
            className="h-11 rounded-md bg-foreground px-6 text-sm font-medium text-background hover:opacity-90"
          >
            Save profile
          </button>
        </div>
      </main>
    </div>
  );
}

function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}
