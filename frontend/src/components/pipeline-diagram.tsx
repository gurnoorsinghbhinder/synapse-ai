import { pipelineStages } from "@/lib/mock";

export function PipelineDiagram({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  if (orientation === "horizontal") {
    return (
      <div className="flex items-center gap-2 overflow-x-auto">
        {pipelineStages.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={
                (s.kind === "core"
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : s.kind === "worker"
                    ? "border-white/15 bg-white/5 text-cockpit-foreground"
                    : "border-signal/40 bg-signal/10 text-signal") +
                " min-w-[110px] rounded-md border px-3 py-2 text-center font-mono text-[11px] uppercase tracking-tight"
              }
            >
              {s.label}
            </div>
            {i < pipelineStages.length - 1 && (
              <div className="h-px w-6 bg-white/20" />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pipelineStages.map((s, i) => (
        <div key={s.id + i}>
          <div className="flex items-center gap-4">
            <div
              className={
                (s.kind === "core" ? "bg-brand ring-brand/30" : s.kind === "worker" ? "bg-cockpit-foreground/70 ring-white/10" : "bg-signal ring-signal/30") +
                " size-2 rounded-full ring-4"
              }
            />
            <div className="h-px flex-1 bg-white/10" />
            <span className="font-mono text-xs uppercase tracking-widest text-cockpit-muted">
              {s.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
