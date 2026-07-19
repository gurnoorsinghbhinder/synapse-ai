import { useEffect, useState } from "react";
import { seedEvents, type PipelineEvent } from "@/lib/mock";

function tickTs(prev: string) {
  const [h, m, s] = prev.split(":").map(Number);
  const next = new Date();
  next.setHours(h, m, s + 1);
  return next.toTimeString().slice(0, 8);
}

export function EventStream({ compact = false }: { compact?: boolean }) {
  const [events, setEvents] = useState<PipelineEvent[]>(seedEvents);

  useEffect(() => {
    const id = setInterval(() => {
      setEvents((prev) => {
        const last = prev[prev.length - 1];
        const template = seedEvents[Math.floor(Math.random() * seedEvents.length)];
        const next: PipelineEvent = {
          ...template,
          ts: tickTs(last.ts),
        };
        const combined = [...prev, next];
        return combined.slice(-(compact ? 6 : 14));
      });
    }, 1400);
    return () => clearInterval(id);
  }, [compact]);

  return (
    <div className="space-y-1.5">
      {events.map((e, i) => {
        const tone =
          e.tone === "signal" ? "text-signal" : e.tone === "muted" ? "text-cockpit-muted" : "text-brand";
        return (
          <div
            key={`${e.ts}-${i}`}
            className="flex gap-3 font-mono text-[10px] leading-tight animate-in fade-in slide-in-from-bottom-1"
          >
            <span className="text-cockpit-muted/60">{e.ts}</span>
            <span className={tone}>[{e.type}]</span>
            <span className="text-cockpit-muted truncate">{e.detail}</span>
          </div>
        );
      })}
    </div>
  );
}
