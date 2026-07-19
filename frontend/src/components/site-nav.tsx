import { Link } from "@tanstack/react-router";

export function SiteNav({ variant = "light" }: { variant?: "light" | "dark" }) {
  const dark = variant === "dark";
  return (
    <nav
      className={
        (dark
          ? "border-cockpit-border bg-cockpit/80 text-cockpit-foreground"
          : "border-border bg-background/80 text-foreground") +
        " sticky top-0 z-40 flex items-center justify-between border-b px-6 py-4 backdrop-blur-md"
      }
    >
      <Link to="/" className="flex items-center gap-2">
        <div className={dark ? "size-6 rounded bg-brand" : "size-6 rounded bg-foreground"} />
        <span className="text-sm font-semibold tracking-tight">Synapse</span>
        <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          v1.0.4
        </span>
      </Link>
      <div className="flex items-center gap-6 text-sm">
        <Link to="/dashboard" className="hover:text-brand transition-colors">
          Dashboard
        </Link>
        <Link to="/engineering" className="hover:text-brand transition-colors">
          Architecture
        </Link>
        <Link
          to="/auth"
          className={
            (dark ? "bg-brand text-brand-foreground" : "bg-foreground text-background") +
            " rounded-md px-4 py-2 text-xs font-medium transition-opacity hover:opacity-90"
          }
        >
          Start Interview
        </Link>
      </div>
    </nav>
  );
}
