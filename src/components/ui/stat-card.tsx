import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const TONE: Record<string, { value: string; icon: string }> = {
  default: { value: "text-foreground", icon: "bg-navy/[0.07] text-navy-3" },
  success: { value: "text-status-success", icon: "bg-status-success-bg text-status-success" },
  pending: { value: "text-status-pending", icon: "bg-status-pending-bg text-status-pending" },
  danger: { value: "text-status-danger", icon: "bg-status-danger-bg text-status-danger" },
  info: { value: "text-status-info", icon: "bg-status-info-bg text-status-info" },
};

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icone,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "pending" | "danger" | "info";
  icon?: LucideIcon;
  href?: string;
}) {
  const t = TONE[tone];
  const corpo = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {Icone && (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.icon}`}>
            <Icone className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <p className={`mt-1.5 text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums ${t.value}`}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="ui-card block p-4 transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-border-strong hover:shadow-md"
      >
        {corpo}
      </Link>
    );
  }
  return <div className="ui-card p-4">{corpo}</div>;
}
