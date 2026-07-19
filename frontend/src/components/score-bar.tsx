export function ScoreBar({
  label,
  value,
  tone = "brand",
}: {
  label: string;
  value: number;
  tone?: "brand" | "signal";
}) {
  const bar = tone === "brand" ? "bg-brand" : "bg-signal";
  return (
    <div className="space-y-2">
      <div className="flex justify-between font-mono text-xs text-cockpit-muted">
        <span className="tracking-widest">{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <div className={bar + " h-full transition-all"} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
