import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { BackendEvent } from "@/lib/backend";
import { EventStream } from "./event-stream";
import { PipelineDiagram } from "./pipeline-diagram";

export function ArchitectureDrawer({
  open,
  onOpenChange,
  interviewId,
  events,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  interviewId?: string | null;
  events?: BackendEvent[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-cockpit-border bg-cockpit text-cockpit-foreground sm:max-w-[480px]"
      >
        <SheetHeader className="border-b border-cockpit-border">
          <SheetTitle className="flex items-center gap-3 text-cockpit-foreground">
            <span className="size-2 rounded-full bg-brand animate-pulse-ring" />
            System Telemetry
            <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
              live
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Live backend event stream, active pipeline, and worker metrics for the current interview.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-10 overflow-y-auto p-6">
          <section className="space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
              Event Stream
            </p>
            <EventStream interviewId={interviewId} initialEvents={events} />
          </section>

          <section className="space-y-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">
              Active Pipeline
            </p>
            <PipelineDiagram />
          </section>

          <section className="grid grid-cols-2 gap-3">
            <MetricCard label="Avg Latency" value="142ms" />
            <MetricCard label="Queue Depth" value="2" />
            <MetricCard label="Events / sec" value="1.2k" />
            <MetricCard label="Workers" value="5 / 5" />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-cockpit-border bg-white/5 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-cockpit-muted">{label}</p>
      <p className="mt-1 text-lg font-medium text-cockpit-foreground">{value}</p>
    </div>
  );
}
