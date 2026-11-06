"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { COR_ETAPA, MOTIVOS_PERDA, type Etapa } from "@/lib/crm/tipos";
import { moverLeadAction } from "../actions";

// Etapas do funil em linha: clica para mover. Perdido pede o motivo; Fechado, o valor.

export function EtapasDoLead({ leadId, etapaId, etapas, valor, motivo }: { leadId: string; etapaId: string | null; etapas: Etapa[]; valor: number | null; motivo: string | null }) {
  const [atual, setAtual] = useState(etapaId);
  const [pedindo, setPedindo] = useState<Etapa | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, iniciar] = useTransition();

  const mover = (e: Etapa, extra: { motivo?: string | null; valor?: number | null } = {}) =>
    iniciar(async () => {
      const antes = atual;
      setAtual(e.id);
      setPedindo(null);
      const r = await moverLeadAction(leadId, e.id, extra);
      if (!r.ok) {
        setAtual(antes);
        toast.error(r.erro);
      } else toast.success(`Movido para ${e.nome}`);
    });

  const ativa = etapas.find((e) => e.id === atual);
  return (
    <section aria-label="Etapa do funil" className="space-y-3">
      <ol className="flex flex-wrap gap-1.5">
        {etapas.map((e) => {
          const on = e.id === atual;
          const cor = COR_ETAPA[e.cor] ?? COR_ETAPA.navy;
          return (
            <li key={e.id}>
              <button
                type="button"
                disabled={enviando}
                aria-current={on ? "step" : undefined}
                onClick={() => {
                  if (on) return;
                  if (e.tipo === "aberta") mover(e);
                  else {
                    setTexto(e.tipo === "perdido" ? MOTIVOS_PERDA[0] : valor ? String(valor) : "");
                    setPedindo(e);
                  }
                }}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors ${on ? `border-transparent font-semibold ${cor.chip}` : "border-border bg-surface text-foreground/75 hover:border-border-strong hover:text-foreground"}`}
              >
                <span className={`h-2 w-2 rounded-full ${cor.ponto}`} aria-hidden />
                {e.nome}
              </button>
            </li>
          );
        })}
      </ol>
      {ativa?.tipo === "perdido" && motivo && !pedindo && <p className="text-sm text-muted">Motivo da perda: {motivo}</p>}
      {pedindo && (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            if (pedindo.tipo === "perdido") mover(pedindo, { motivo: texto });
            else {
              const n = Number(texto.replace(/\./g, "").replace(",", "."));
              mover(pedindo, texto.trim() && Number.isFinite(n) ? { valor: n } : {});
            }
          }}
          className="ui-card flex flex-wrap items-end gap-2 p-4"
        >
          <label className="min-w-56 flex-1 space-y-1.5">
            <span className="ui-label">{pedindo.tipo === "perdido" ? "Por que foi perdido?" : "Valor fechado (R$, opcional)"}</span>
            {pedindo.tipo === "perdido" ? (
              <input list="motivos-perda" value={texto} onChange={(e) => setTexto(e.target.value)} className="ui-input" autoFocus />
            ) : (
              <input value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal" placeholder="Ex.: 2.500" className="ui-input" autoFocus />
            )}
            <datalist id="motivos-perda">
              {MOTIVOS_PERDA.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <button type="button" onClick={() => setPedindo(null)} className="ui-btn-secondary px-4 py-2 text-sm">
            Cancelar
          </button>
          <button type="submit" className="ui-btn px-4 py-2 text-sm">
            Mover para {pedindo.nome}
          </button>
        </form>
      )}
    </section>
  );
}
