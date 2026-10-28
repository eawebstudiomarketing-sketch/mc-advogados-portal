import { CalendarClock } from "lucide-react";
import type { StatusContrato } from "@/lib/contrato";

const COR = {
  ok: "bg-status-success-bg text-status-success",
  atencao: "bg-status-pending-bg text-status-pending",
  urgente: "bg-status-danger-bg text-status-danger",
  vencido: "bg-status-danger-bg text-status-danger",
} as const;

/** Mini status no cliente: quanto falta para o fim do contrato. */
export function ContratoStatus({ status }: { status: StatusContrato }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${COR[status.tom]}`} title={`Fim do contrato: ${status.fim.split("-").reverse().join("/")}`}>
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      Contrato {status.texto} · {status.fim.split("-").reverse().join("/")}
    </span>
  );
}
