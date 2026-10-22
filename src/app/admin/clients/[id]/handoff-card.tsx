import Link from "next/link";
import { ClipboardCheck, Pencil, AlertTriangle, ArrowRight } from "lucide-react";
import { handoffProgresso, type HandoffAnswers, type TipoPessoa } from "@/lib/handoff-schema";

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Chips({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted">{titulo}</p>
      <div className="flex flex-wrap gap-1.5">
        {itens.map((i) => (
          <span key={i} className="rounded-full bg-navy/[0.06] px-2.5 py-0.5 text-xs font-medium text-navy-3">
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

// Resumo da Ficha de Handoff na ficha do cliente (substitui a triagem em texto livre).
export function HandoffCard({
  clientId,
  handoff,
  updatedAt,
  triagemAntiga,
  tipo = "PJ",
}: {
  tipo?: TipoPessoa;
  clientId: string;
  handoff: HandoffAnswers | null;
  updatedAt: string | null;
  triagemAntiga: string | null;
}) {
  const h = handoff ?? {};
  const { feitos, total } = handoffProgresso(handoff, tipo);
  const pf = tipo === "PF";
  const pct = Math.round((feitos / total) * 100);
  const lista = (id: string) => [...((h[id] as string[]) ?? []), ...(typeof h[`${id}_outro`] === "string" && h[`${id}_outro`] ? [h[`${id}_outro`] as string] : [])];
  const href = `/admin/clients/${clientId}/handoff`;

  if (feitos === 0) {
    return (
      <section className="ui-card flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold-ink">
          <ClipboardCheck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="section-title">Ficha de Handoff</h2>
          <p className="text-[13px] text-muted">{pf ? "Ainda não preenchida. É o resumo do caso que o comercial passa para o jurídico." : "Ainda não preenchida. É a base que a IA lê para o onboarding e as demandas."}</p>
        </div>
        <Link href={href} className="ui-btn">
          Preencher ficha <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {triagemAntiga?.trim() && <Anotacoes texto={triagemAntiga} />}
      </section>
    );
  }

  return (
    <section className="ui-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy/[0.07] text-navy-3">
            <ClipboardCheck className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="section-title">Ficha de Handoff</h2>
            <p className="text-xs text-muted">
              {feitos} de {total} campos · {h.status ? String(h.status) : "sem status"}
              {updatedAt ? ` · atualizada em ${quando(updatedAt)}` : ""}
            </p>
          </div>
        </div>
        <Link href={href} className="icon-btn border border-border-strong bg-surface" aria-label="Editar ficha" data-tip="Editar ficha">
          <Pencil aria-hidden />
        </Link>
      </div>

      <div className="mt-3 h-1 overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>

      {pf && [["pf_prazo_correndo", "pf_prazo_detalhe", "Prazo correndo"], ["pf_audiencia", "pf_audiencia_detalhe", "Audiência marcada"], ["pf_prescricao", "pf_prescricao_detalhe", "Risco de prescrição"]].map(([k, d, rot]) =>
        h[k] === "Sim" ? (
          <div key={k} className="mt-4 flex gap-2.5 rounded-xl bg-status-danger-bg px-3.5 py-2.5 text-[13px] text-status-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              <span className="font-semibold">{rot}:</span> {String(h[d] ?? "informado na ficha")}
            </p>
          </div>
        ) : null
      )}

      {pf && (
        <div className="mt-4 space-y-3">
          {[["pf_area", "Área"], ["pf_parte_contraria", "Parte contrária"], ["pf_relato", "O que aconteceu"], ["pf_pedido_principal", "Pedido principal"]].map(([k, rot]) =>
            typeof h[k] === "string" && h[k] ? (
              <div key={k}>
                <p className="mb-0.5 text-xs font-medium text-muted">{rot}</p>
                <p className="line-clamp-3 text-sm leading-relaxed text-foreground">{String(h[k])}</p>
              </div>
            ) : null
          )}
          <Chips titulo="Documentos que já tem" itens={lista("pf_documentos_tem")} />
        </div>
      )}

      {!pf && h.urgente === "Sim" && (
        <div className="mt-4 flex gap-2.5 rounded-xl bg-status-danger-bg px-3.5 py-2.5 text-[13px] text-status-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Atenção imediata:</span> {String(h.urgente_descricao ?? "situação urgente informada")}
            {h.urgente_prazo ? ` · prazo: ${String(h.urgente_prazo)}` : ""}
          </p>
        </div>
      )}

      {!pf && (
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Chips titulo="Dores identificadas" itens={lista("dores")} />
        <Chips titulo="Objetivos" itens={lista("objetivos")} />
      </div>
      )}

      {!pf && typeof h.motivo === "string" && h.motivo && (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium text-muted">Motivo da contratação</p>
          <p className="line-clamp-3 text-sm leading-relaxed text-foreground">{h.motivo}</p>
        </div>
      )}

      {triagemAntiga?.trim() && <Anotacoes texto={triagemAntiga} />}
    </section>
  );
}

function Anotacoes({ texto }: { texto: string }) {
  return (
    <details className="group mt-4 w-full rounded-xl bg-surface-2 px-3.5 py-2.5">
      <summary className="cursor-pointer list-none text-xs font-medium text-muted marker:hidden group-open:mb-2">
        Anotações anteriores (triagem em texto livre)
      </summary>
      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{texto}</p>
    </details>
  );
}
