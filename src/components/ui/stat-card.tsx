export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "pending" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-status-success"
      : tone === "pending"
        ? "text-status-pending"
        : tone === "danger"
          ? "text-status-danger"
          : "text-navy";

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-foreground/50">{hint}</p> : null}
    </div>
  );
}
