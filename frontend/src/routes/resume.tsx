import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteNav } from "@/components/site-nav";
import { getCandidate, uploadResume, type CandidateProject, type CandidateExp } from "@/lib/backend";
import { getCandidateId, setCandidateId } from "@/lib/session";
import { UploadCloud, FileText, Check } from "lucide-react";
import { useState, useEffect } from "react";

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
  const [parsed, setParsed] = useState(false);
  const [drag, setDrag] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [projects, setProjects] = useState<CandidateProject[]>([]);
  const [experience, setExperience] = useState<CandidateExp[]>([]);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const candidateId = getCandidateId();
    if (!candidateId) return;

    getCandidate(candidateId)
      .then((c) => {
        setName(c.name || "");
        setEmail(c.email || "");
        setResumeText(c.resume_text || "");
        setSkills(c.skills || []);
        setProjects(c.projects || []);
        setExperience(c.experience || []);
        setFileName("Saved Profile");
        setParsed(true);
      })
      .catch(() => {});
  }, []);

  async function readFile(file: File) {
    const text = await file.text();
    setFileName(file.name);
    setResumeText(text);
    setParsed(false);
  }

  async function saveProfile() {
    setSaving(true);
    setStatus(null);
    try {
      const result = await uploadResume({ name, email, resumeText });
      const c = result.candidate;
      setCandidateId(c.id);
      
      setName(c.name || "");
      setEmail(c.email || "");
      setResumeText(c.resume_text || "");
      setSkills(c.skills || []);
      setProjects(c.projects || []);
      setExperience(c.experience || []);

      setParsed(true);
      setFileName("Parsed Profile");
      setStatus(`Backend profile ready · ${c.id}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Resume upload failed");
    } finally {
      setSaving(false);
    }
  }

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
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const file = e.dataTransfer.files[0];
              if (file) void readFile(file);
            }}
            className={
              "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 text-center transition-colors " +
              (drag ? "border-brand bg-brand/5" : "border-border bg-card")
            }
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <UploadCloud className="size-5" />
            </div>
            <div>
              <p className="font-medium">Drop your resume file here</p>
              <p className="text-xs text-muted-foreground">Max 5 MB · TXT or MD files supported</p>
            </div>
            <label className="mt-2 inline-flex h-9 cursor-pointer items-center rounded-md bg-foreground px-4 text-xs font-medium text-background hover:opacity-90">
              Choose file
              <input
                type="file"
                className="sr-only"
                accept=".txt,.md"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) void readFile(file);
                }}
              />
            </label>
          </div>
          <div className="mt-4 grid gap-3 rounded-xl border border-border bg-card p-5 md:grid-cols-2">
            <label className="space-y-2 text-xs font-medium">
              Candidate name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Extracting..."
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Extracting..."
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="space-y-2 text-xs font-medium md:col-span-2">
              Resume text sent to backend
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume text here or drag and drop a file..."
                rows={6}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand"
              />
            </label>
          </div>
          {parsed && (
            <div className="mt-4 flex items-center gap-3 rounded-md border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
              <div className="flex size-6 items-center justify-center rounded-full bg-brand text-brand-foreground">
                <Check className="size-3.5" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{fileName}</p>
                <p className="text-xs text-muted-foreground">{status ?? "Parsed · backend candidate profile synced"}</p>
              </div>
              <FileText className="size-4 text-muted-foreground" />
            </div>
          )}
          {status && !parsed && <p className="mt-3 text-sm text-destructive">{status}</p>}
        </section>

        <section className="mb-10">
          <SectionHeader label="/skills" title="Extracted skills" />
          <div className="flex flex-wrap gap-2">
            {skills.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">No skills extracted yet. Save your profile to trigger AI extraction.</span>
            ) : (
              skills.map((s) => (
                <span
                  key={s}
                  className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-[11px] tracking-tight"
                >
                  {s}
                </span>
              ))
            )}
          </div>
        </section>

        <section className="mb-10">
          <SectionHeader label="/projects" title="Projects" />
          <div className="grid gap-3 md:grid-cols-2">
            {projects.length === 0 ? (
              <p className="text-xs text-muted-foreground italic col-span-2">No projects extracted yet.</p>
            ) : (
              projects.map((p) => (
                <div key={p.name} className="rounded-xl border border-border bg-card p-5">
                  <p className="font-display text-base font-semibold">{p.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-brand">{p.stack}</p>
                  <p className="mt-3 text-xs text-muted-foreground">{p.impact}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mb-12">
          <SectionHeader label="/experience" title="Experience" />
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {experience.length === 0 ? (
              <p className="text-xs text-muted-foreground italic p-5">No experience extracted yet.</p>
            ) : (
              experience.map((e) => (
                <div key={e.role} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="font-medium">{e.role}</p>
                    <p className="text-xs text-muted-foreground">{e.company}</p>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{e.years}</p>
                </div>
              ))
            )}
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
            onClick={() => void saveProfile()}
            disabled={saving}
            className="h-11 rounded-md bg-foreground px-6 text-sm font-medium text-background hover:opacity-90"
          >
            {saving ? "Saving..." : "Save profile"}
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
