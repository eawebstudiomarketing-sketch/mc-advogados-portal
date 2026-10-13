import type { DemandPriority } from "@/lib/onboarding-demands";

// Prazo padrão por prioridade (decisão do usuário, 2026-09-23): alta 7 dias,
// média 15, baixa 30. Editável por item antes de aprovar.
const DEADLINE_DAYS: Record<DemandPriority, number> = { alta: 7, media: 15, baixa: 30 };

export function defaultDeadline(priority: DemandPriority): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const t = Date.parse(today + "T00:00:00Z") + DEADLINE_DAYS[priority] * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
