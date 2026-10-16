import Link from "next/link";
import type { LucideIcon } from "lucide-react";

// Contador no padrão do portal (referência noubla): número grande e pesado,
// rótulo pequeno em fonte mono embaixo, bolinha de cor no lugar do ícone.
const TONE: Record<string, { value: string; dot: string }> = {
  default: { value: "text-foreground", dot: "bg-navy" },
  success: { value: "text-status-success", dot: "bg-status-success" },
  pending: { value: "text-status-pending", dot: "bg-status-pending" },
  danger: { value: "text-status-danger", dot: "bg-status-danger" },
  info: { value: "text-status-info", dot: "bg-status-info" },
};

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "pending" | "danger" | "info";
  /** mantido por compatibilidade; o contador não mostra mais ícone */
  icon?: LucideIcon;
  href?: string;
}) {
  const t = TONE[tone];
  const corpo = (
    <>
      <p className={`numero-grande text-[2.25rem] leading-none ${t.value}`}>{value}</p>
      <p className="eyebrow mt-2 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden />
        {label}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="ui-card block p-5 transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-border-strong">
        {corpo}
      </Link>
    );
  }
  return <div className="ui-card p-5">{corpo}</div>;
}
