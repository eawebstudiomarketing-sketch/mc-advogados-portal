"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Megaphone, MessageCircle, Sparkles, StickyNote, UserCheck, UserCog } from "lucide-react";
import type { LeadEvento } from "@/lib/crm/tipos";
import { notaLeadAction } from "../actions";

// Histórico do lead (mais novo em cima) + campo para anotar.

const ICONE: Record<string, typeof StickyNote> = { criado: Sparkles, formulario: Sparkles, etapa: ArrowRight, nota: StickyNote, contato: MessageCircle, responsavel: UserCog, cliente: UserCheck, pixel: Megaphone };
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" });

export function Historico({ leadId, eventos }: { leadId: string; eventos: (LeadEvento & { autorNome: string | null })[] }) {
  const [texto, setTexto] = useState("");
  const [salvando, iniciar] = useTransition();
  return (
    <section className="ui-card p-5" aria-labelledby="historico">
      <h2 id="historico" className="section-title mb-3">
        Histórico
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            const r = await notaLeadAction(leadId, texto);
            if (r.ok) setTexto("");
            else toast.error(r.erro);
          });
        }}
        className="mb-5 space-y-2"
      >
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Anotar: ligação, combinado, objeção…" className="ui-input" aria-label="Nova anotação" />
        <div className="flex justify-end">
          <button type="submit" disabled={salvando || !texto.trim()} className="ui-btn-secondary px-4 py-1.5 text-sm">
            {salvando ? "Salvando…" : "Anotar"}
          </button>
        </div>
      </form>
      <ol className="space-y-3.5">
        {eventos.map((e) => {
          const Icone = ICONE[e.tipo] ?? StickyNote;
          return (
            <li key={e.id} className="flex gap-3">
              <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${e.tipo === "nota" ? "bg-gold-soft text-gold-ink" : e.tipo === "pixel" ? "bg-status-info-bg text-status-info" : "bg-surface-2 text-muted"}`}>
                <Icone className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-line text-foreground">{e.texto}</p>
                <p className="text-xs text-muted">
                  {dataHora(e.created_at)}
                  {e.autorNome ? ` · ${e.autorNome}` : ""}
                </p>
              </div>
            </li>
          );
        })}
        {eventos.length === 0 && <li className="text-sm text-muted">Nada ainda.</li>}
      </ol>
    </section>
  );
}
