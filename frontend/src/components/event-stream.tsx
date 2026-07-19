import { useEffect, useState } from "react";
import { interviewEventsURL, type BackendEvent } from "@/lib/backend";
import { seedEvents, type PipelineEvent } from "@/lib/mock";

function tickTs(prev: string) {
  const [h, m, s] = prev.split(":").map(Number);
  const next = new Date();
  next.setHours(h, m, s + 1);
  return next.toTimeString().slice(0, 8);
}

function formatBackendEvent(event: BackendEvent): PipelineEvent {
  const payload = event.payload ?? {};
  let detail: string;
  if (event.type === "QuestionGenerated") {
    const topic = typeof payload.topic === "string" ? payload.topic : "";
    const strategy = typeof payload.strategy === "string" ? payload.strategy : "";
    const difficulty = typeof payload.difficulty === "string" ? payload.difficulty : "";
    detail = `[${strategy}] ${topic} (${difficulty})`;
  } else if (typeof payload.question === "string") {
    detail = payload.question;
  } else if (typeof payload.answer === "string") {
    detail = payload.answer;
  } else if (typeof payload.feedback === "string") {
    detail = payload.feedback;
  } else {
    detail = event.topic;
  }

  return {
    ts: new Date(event.timestamp).toTimeString().slice(0, 8),
    type: event.type,
    detail,
    tone:
      event.type === "AnswerEvaluated" || event.type === "MetricsUpdated"
        ? "signal"
        : event.type === "QuestionGenerated"
          ? "brand"
          : event.type === "TimelineUpdated"
            ? "muted"
            : "brand",
  };
}

export function EventStream({
  compact = false,
  interviewId,
  initialEvents = [],
}: {
  compact?: boolean;
  interviewId?: string | null;
  initialEvents?: BackendEvent[];
}) {
  const [events, setEvents] = useState<PipelineEvent[]>(seedEvents);

  useEffect(() => {
    if (interviewId) {
      setEvents((initialEvents.length ? initialEvents : []).map(formatBackendEvent).slice(-(compact ? 6 : 14)));
      const socket = new WebSocket(interviewEventsURL(interviewId));
      socket.onmessage = (message) => {
        const event = JSON.parse(message.data) as BackendEvent;
        setEvents((prev) => [...prev, formatBackendEvent(event)].slice(-(compact ? 6 : 14)));
      };
      socket.onerror = () => socket.close();
      return () => socket.close();
    }

    setEvents(seedEvents);
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
  }, [compact, interviewId, initialEvents]);

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