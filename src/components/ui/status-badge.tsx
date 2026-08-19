const STATUS_MAP: Record<string, { label: string; fg: string; bg: string }> = {
  pago: { label: "Pago", fg: "text-status-success", bg: "bg-status-success-bg" },
  ativo: { label: "Ativo", fg: "text-status-success", bg: "bg-status-success-bg" },
  concluida: { label: "Concluída", fg: "text-status-success", bg: "bg-status-success-bg" },

  pendente: { label: "Pendente", fg: "text-status-pending", bg: "bg-status-pending-bg" },
  aberta: { label: "Aberta", fg: "text-status-pending", bg: "bg-status-pending-bg" },

  atrasado: { label: "Atrasado", fg: "text-status-danger", bg: "bg-status-danger-bg" },
  cancelado: { label: "Cancelado", fg: "text-status-danger", bg: "bg-status-danger-bg" },
  inativo: { label: "Inativo", fg: "text-status-danger", bg: "bg-status-danger-bg" },

  em_andamento: { label: "Em andamento", fg: "text-status-info", bg: "bg-status-info-bg" },
  info: { label: "Info", fg: "text-status-info", bg: "bg-status-info-bg" },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const entry = STATUS_MAP[status] ?? { label: label ?? status, fg: "text-foreground/70", bg: "bg-border" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${entry.fg} ${entry.bg}`}
    >
      {label ?? entry.label}
    </span>
  );
}
