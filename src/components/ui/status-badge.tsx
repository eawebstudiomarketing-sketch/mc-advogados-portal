const STATUS_MAP: Record<string, { label: string; fg: string; bg: string; dot: string }> = {
  pago: { label: "Pago", fg: "text-status-success", bg: "bg-status-success-bg", dot: "bg-status-success" },
  paid: { label: "Pago", fg: "text-status-success", bg: "bg-status-success-bg", dot: "bg-status-success" },
  ativo: { label: "Ativo", fg: "text-status-success", bg: "bg-status-success-bg", dot: "bg-status-success" },
  active: { label: "Ativo", fg: "text-status-success", bg: "bg-status-success-bg", dot: "bg-status-success" },
  concluida: { label: "Concluída", fg: "text-status-success", bg: "bg-status-success-bg", dot: "bg-status-success" },

  pendente: { label: "Pendente", fg: "text-status-pending", bg: "bg-status-pending-bg", dot: "bg-status-pending" },
  pending: { label: "Pendente", fg: "text-status-pending", bg: "bg-status-pending-bg", dot: "bg-status-pending" },
  aberta: { label: "A fazer", fg: "text-status-pending", bg: "bg-status-pending-bg", dot: "bg-status-pending" },
  expired: { label: "Expirado", fg: "text-status-pending", bg: "bg-status-pending-bg", dot: "bg-status-pending" },

  atrasado: { label: "Atrasado", fg: "text-status-danger", bg: "bg-status-danger-bg", dot: "bg-status-danger" },
  overdue: { label: "Atrasado", fg: "text-status-danger", bg: "bg-status-danger-bg", dot: "bg-status-danger" },
  cancelado: { label: "Cancelado", fg: "text-muted", bg: "bg-surface-2", dot: "bg-border-strong" },
  cancelada: { label: "Cancelada", fg: "text-muted", bg: "bg-surface-2", dot: "bg-border-strong" },
  cancelled: { label: "Cancelado", fg: "text-muted", bg: "bg-surface-2", dot: "bg-border-strong" },
  inativo: { label: "Inativo", fg: "text-muted", bg: "bg-surface-2", dot: "bg-border-strong" },

  em_andamento: { label: "Em andamento", fg: "text-status-info", bg: "bg-status-info-bg", dot: "bg-status-info" },
  info: { label: "Info", fg: "text-status-info", bg: "bg-status-info-bg", dot: "bg-status-info" },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const entry = STATUS_MAP[status] ?? { label: label ?? status, fg: "text-muted", bg: "bg-surface-2", dot: "bg-border-strong" };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${entry.fg} ${entry.bg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${entry.dot}`} aria-hidden />
      {label ?? entry.label}
    </span>
  );
}
