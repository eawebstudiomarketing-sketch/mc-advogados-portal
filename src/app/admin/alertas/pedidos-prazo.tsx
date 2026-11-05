"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { decidirPrazoAction } from "@/app/admin/activities/prazo-actions";
import type { PedidoPrazo } from "@/lib/prazo-pedidos";

// Aba Prazos em Alertas (05/11/2026): pedidos da equipe para mudar o prazo de
// uma atividade. Só o admin máximo vê. Aprovar já muda o prazo; a pessoa
// recebe a resposta no WhatsApp.

const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "sem prazo");
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ROTULO = { aprovado: "Aprovado", recusado: "Recusado", cancelado: "Cancelado pela pessoa", pendente: "Aguardando" } as const;

function Pedido({ p }: { p: PedidoPrazo }) {
  const router = useRouter();
  const [resposta, setResposta] = useState("");
  const [indo, start] = useTransition();
  const decidir = (aprovar: boolean) =>
    start(async () => {
      const r = await decidirPrazoAction(p.id, aprovar, resposta);
      if (!r.ok) return void toast.error(r.error);
      toast.success(aprovar ? `Aprovado: o prazo agora é ${br(p.prazo_novo)}.` : "Pedido recusado.");
      router.refresh();
    });

  return (
    <li className="ui-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <a href={`/admin/activities/${p.activity_id}`} className="font-medium text-foreground hover:underline">
          {p.atividade}
        </a>
        {p.cliente && <span className="text-sm text-muted">{p.cliente}</span>}
        <span className="ml-auto text-xs text-muted tabular-nums">{quando(p.created_at)}</span>
      </div>
      <p className="mt-1 text-sm text-foreground/85">
        <strong>{p.quem}</strong> pede para mudar de <strong>{br(p.prazo_atual)}</strong> para <strong>{br(p.prazo_novo)}</strong>.
      </p>
      <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap text-foreground/85">{p.justificativa}</p>
      {p.status === "pendente" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={resposta} onChange={(e) => setResposta(e.target.value)} maxLength={500} placeholder="Resposta (opcional): vai junto no WhatsApp" aria-label="Resposta" className="ui-input min-w-0 flex-1 !py-1.5 text-sm" />
          <button type="button" onClick={() => decidir(true)} disabled={indo} className="ui-btn px-3 py-1.5 text-xs">
            <Check className="h-3.5 w-3.5" aria-hidden /> Aprovar
          </button>
          <button type="button" onClick={() => decidir(false)} disabled={indo} className="ui-btn-secondary px-3 py-1.5 text-xs">
            <X className="h-3.5 w-3.5" aria-hidden /> Recusar
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">
          {ROTULO[p.status]}
          {p.decidido_em ? ` em ${quando(p.decidido_em)}` : ""}
          {p.resposta ? ` · ${p.resposta}` : ""}
        </p>
      )}
    </li>
  );
}

export function PedidosPrazo({ pendentes, decididos }: { pendentes: PedidoPrazo[]; decididos: PedidoPrazo[] }) {
  return (
    <div className="space-y-8">
      <section>
        {pendentes.length ? (
          <ul className="space-y-3">
            {pendentes.map((p) => (
              <Pedido key={p.id} p={p} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nenhum pedido de mudança de prazo aguardando.</p>
        )}
      </section>
      {!!decididos.length && (
        <section>
          <h2 className="section-title mb-3">Já decididos</h2>
          <ul className="space-y-3">
            {decididos.map((p) => (
              <Pedido key={p.id} p={p} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
