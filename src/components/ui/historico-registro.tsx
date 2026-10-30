import { History } from "lucide-react";
import { nomeDoCampo, type EventoHistorico } from "@/lib/historico-campos";

// Bloco "Histórico" das fichas (item 12): quem mexeu, quando e em quê.
// Lista vazia (quem não é admin máximo não lê a auditoria) = o bloco some.

const quandoBR = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function HistoricoRegistro({ eventos, className = "" }: { eventos: EventoHistorico[]; className?: string }) {
  if (!eventos.length) return null;
  return (
    <details className={`group/hist rounded-xl border border-border ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium text-foreground select-none">
        <History className="h-4 w-4 text-muted" aria-hidden />
        <span className="flex-1">Histórico de alterações</span>
        <span className="text-xs font-normal text-muted">{eventos.length} registro(s) · clique para abrir</span>
      </summary>
      <ol className="space-y-2 border-t border-border px-4 py-3">
        {eventos.map((e, i) => (
          <li key={i} className="text-[13px] leading-snug">
            <span className="text-muted tabular-nums">{quandoBR(e.quando)}</span>{" "}
            <strong className="font-semibold text-foreground">{e.quem ?? "Sistema"}</strong>{" "}
            <span className="text-foreground/80">
              {e.acao === "criou" ? "criou" : e.acao === "excluiu" ? "excluiu" : `mudou ${e.campos.map(nomeDoCampo).join(", ")}`}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
