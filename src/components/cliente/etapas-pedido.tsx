import { Check } from "lucide-react";
import { ETAPAS, type Etapa } from "@/lib/data/portal-cliente";

// Linha de etapas do pedido do cliente: Enviado → Recebido → Em andamento → Concluído.
export function EtapasPedido({ etapa }: { etapa: Etapa }) {
  const atual = ETAPAS.findIndex((e) => e.chave === etapa);
  return (
    <ol className="flex items-start" aria-label={`Etapa: ${ETAPAS[atual].rotulo}`}>
      {ETAPAS.map((e, i) => {
        const feito = i < atual || etapa === "concluido";
        const agora = i === atual && etapa !== "concluido";
        return (
          <li key={e.chave} className="flex min-w-0 flex-1 flex-col items-start" aria-current={agora ? "step" : undefined}>
            <div className="flex w-full items-center">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  feito ? "bg-status-success text-white" : agora ? "bg-navy text-white ring-4 ring-navy/10" : "border border-border-strong bg-surface"
                }`}
              >
                {feito ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : agora ? <span className="h-1.5 w-1.5 rounded-full bg-gold-2" /> : null}
              </span>
              {i < ETAPAS.length - 1 && <span className={`mx-1 h-px flex-1 ${i < atual ? "bg-status-success" : "bg-border"}`} aria-hidden />}
            </div>
            <span className={`mt-1.5 truncate pr-1 text-[11px] ${agora ? "font-semibold text-foreground" : feito ? "text-foreground/70" : "text-muted"}`}>{e.rotulo}</span>
          </li>
        );
      })}
    </ol>
  );
}
