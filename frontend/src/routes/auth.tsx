import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Synapse" },
      { name: "description", content: "Access your Synapse control panel." },
      { property: "og:title", content: "Sign in · Synapse" },
      { property: "og:description", content: "Access your Synapse control panel." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-cockpit p-12 text-cockpit-foreground lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-6 rounded bg-brand" />
          <span className="text-sm font-semibold tracking-tight">Synapse</span>
        </Link>
        <div className="space-y-6">
          <p className="font-mono text-[11px] uppercase tracking-widest text-brand">
            /control-panel
          </p>
          <h2 className="max-w-[16ch] font-display text-4xl font-semibold leading-tight tracking-tight">
            Mission control for autonomous AI sessions.
          </h2>
          <p className="max-w-[38ch] text-sm text-cockpit-muted">
            A single console for the candidate's screen, the interviewer's brain, and the
            engineers watching it happen.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Sessions today" value="128" />
          <Stat label="Avg latency" value="142ms" />
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              /auth
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Continue to your dashboard. New here?{" "}
              <span className="underline underline-offset-4">Request access.</span>
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setLoading(true);
              setTimeout(() => nav({ to: "/dashboard" }), 400);
            }}
            className="space-y-4"
          >
            <label className="block space-y-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Email
              </span>
              <input
                type="email"
                required
                defaultValue="bhinder@synapse.dev"
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-sm outline-none ring-brand/20 focus:ring-2"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Password
              </span>
              <input
                type="password"
                required
                defaultValue="••••••••"
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-sm outline-none ring-brand/20 focus:ring-2"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center rounded-md bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-70"
            >
              {loading ? "Connecting..." : "Sign in"}
            </button>
          </form>

          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={() => nav({ to: "/dashboard" })}
            className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted"
          >
            <GoogleIcon /> Continue with Google
          </button>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-cockpit-border bg-white/5 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-cockpit-foreground">{value}</p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-4">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.5 2.4 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6C12.4 13 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.7-9.9 6.7-17.2z"/>
      <path fill="#FBBC05" d="M10.4 28.8c-.5-1.4-.8-2.8-.8-4.3s.3-2.9.8-4.3l-7.8-6C1 17.3 0 20.5 0 24s1 6.7 2.6 9.8l7.8-6z"/>
      <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15.1-5.5l-7.3-5.7c-2 1.4-4.6 2.2-7.8 2.2-6.3 0-11.6-3.5-13.6-9.2l-7.8 6C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  );
}
