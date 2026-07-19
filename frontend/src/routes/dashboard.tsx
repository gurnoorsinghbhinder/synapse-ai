import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/site-nav";
import { mockInterviews, mockUser } from "@/lib/mock";
import { FileCheck2, PlayCircle, Settings, Cpu, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Synapse" },
      { name: "description", content: "Your session history, resume status, and quick actions." },
      { property: "og:title", content: "Dashboard · Synapse" },
      { property: "og:description", content: "Session history, resume status, quick actions." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main className="mx-auto max-w-7xl px-6 py-16">
        <header className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              /control-panel
            </p>
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              Welcome back, {mockUser.name}.
            </h1>
            <p className="text-sm text-muted-foreground">
              Everything is warm — resume parsed, workers idle, latency nominal.
            </p>
          </div>
          <Link
            to="/interview"
            className="inline-flex h-11 items-center gap-2 self-start rounded-md bg-foreground px-6 text-sm font-medium text-background hover:opacity-90"
          >
            Start new interview <ArrowUpRight className="size-4" />
          </Link>
        </header>

        <section className="mb-12 grid gap-4 md:grid-cols-3">
          <StatCard label="Resume" value="Uploaded" caption="8 skills · 2 projects parsed" tone="brand" />
          <StatCard label="Interviews" value="3" caption="Last 30 days" />
          <StatCard label="Average score" value="82%" caption="+4 vs. previous month" />
        </section>

        <section className="mb-12 grid gap-4 md:grid-cols-4">
          <ActionTile to="/interview" icon={<PlayCircle className="size-5" />} title="Start Interview" desc="Live session" primary />
          <ActionTile to="/resume" icon={<FileCheck2 className="size-5" />} title="Resume" desc="Review profile" />
          <ActionTile to="/dashboard" icon={<Settings className="size-5" />} title="Settings" desc="Preferences" />
          <ActionTile to="/engineering" icon={<Cpu className="size-5" />} title="Architecture" desc="Judge mode" />
        </section>

        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight">Recent interviews</h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              /history
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 text-left">Date</th>
                  <th className="px-6 py-3 text-left">Role</th>
                  <th className="px-6 py-3 text-right">Score</th>
                  <th className="px-6 py-3 text-right">·</th>
                </tr>
              </thead>
              <tbody>
                {mockInterviews.map((row) => (
                  <tr key={row.date} className="border-b border-border last:border-none">
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{row.date}</td>
                    <td className="px-6 py-4 font-medium">{row.role}</td>
                    <td className="px-6 py-4 text-right font-display text-lg">{row.score}</td>
                    <td className="px-6 py-4 text-right">
                      <Link to="/results" className="text-xs font-medium text-brand hover:underline">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label, value, caption, tone,
}: { label: string; value: string; caption: string; tone?: "brand" }) {
  return (
    <div className={"rounded-xl border p-6 " + (tone === "brand" ? "border-brand/30 bg-brand/5" : "border-border bg-card")}>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={"mt-3 font-display text-3xl font-semibold " + (tone === "brand" ? "text-brand" : "")}>
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

function ActionTile({
  to, icon, title, desc, primary,
}: { to: string; icon: React.ReactNode; title: string; desc: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={
        "group flex flex-col justify-between gap-8 rounded-xl border p-6 transition-all hover:-translate-y-0.5 " +
        (primary
          ? "border-transparent bg-cockpit text-cockpit-foreground hover:opacity-95"
          : "border-border bg-card hover:border-foreground/20")
      }
    >
      <div className={"flex size-10 items-center justify-center rounded-md " + (primary ? "bg-brand text-brand-foreground" : "bg-muted")}>
        {icon}
      </div>
      <div>
        <p className="font-display text-lg font-semibold tracking-tight">{title}</p>
        <p className={"text-xs " + (primary ? "text-cockpit-muted" : "text-muted-foreground")}>{desc}</p>
      </div>
    </Link>
  );
}
