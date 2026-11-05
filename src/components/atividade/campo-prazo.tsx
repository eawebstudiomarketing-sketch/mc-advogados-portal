"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { cancelarPedidoPrazoAction, pedirPrazoAction } from "@/app/admin/activities/prazo-actions";

// Campo de prazo da atividade (05/11/2026): quem não é o admin máximo não muda
// um prazo que já existe. Vê a data travada e o botão Pedir mudança (nova data +
// justificativa), que vai para o Dr. Maurício aprovar. Sem prazo ainda, o campo
// é livre. Os campos do pedido não têm `name`: não entram no formulário de fora.

export type PedidoAberto = { id: string; prazo_novo: string | null } | null;

const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "sem prazo");

export function CampoPrazo({
  activityId,
  deadline,
  podeMudar,
  pedido: pedidoInicial,
  inputId = "deadline",
}: {
  activityId: string;
  deadline: string | null;
  podeMudar: boolean;
  pedido: PedidoAberto;
  inputId?: string;
}) {
  const router = useRouter();
  const [abrir, setAbrir] = useState(false);
  const [nova, setNova] = useState(deadline ?? "");
  const [just, setJust] = useState("");
  const [enviando, start] = useTransition();
  // a mini tela não recarrega sozinha: guarda aqui o pedido recém-feito
  const [pedido, setPedido] = useState<PedidoAberto>(pedidoInicial);

  if (podeMudar || !deadline) return <input id={inputId} name="deadline" type="date" defaultValue={deadline ?? ""} className="ui-input" />;

  function enviar() {
    if (just.trim().length < 5) return void toast.error("Escreva a justificativa.");
    start(async () => {
      const r = await pedirPrazoAction(activityId, nova || null, just);
      if (!r.ok) return void toast.error(r.error);
      if (r.aplicado) toast.success("Prazo alterado.");
      else {
        toast.success("Pedido enviado ao Dr. Maurício. Você recebe a resposta no WhatsApp.");
        setPedido({ id: "", prazo_novo: nova || null });
      }
      setAbrir(false);
      setJust("");
      router.refresh();
    });
  }

  function cancelar(id: string) {
    start(async () => {
      const r = await cancelarPedidoPrazoAction(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Pedido cancelado.");
      setPedido(null);
      router.refresh();
    });
  }

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span id={inputId} className="ui-input inline-flex w-auto items-center gap-1.5 bg-surface-2 text-foreground/80" aria-label="Prazo (travado)">
          <Lock className="h-3.5 w-3.5 text-muted" aria-hidden /> {br(deadline)}
        </span>
        {!pedido && !abrir && (
          <button type="button" onClick={() => setAbrir(true)} className="ui-btn-secondary px-3 py-1.5 text-xs">
            Pedir mudança de prazo
          </button>
        )}
      </div>
      {pedido && (
        <p className="text-xs text-muted">
          Pedido para <strong className="text-foreground">{br(pedido.prazo_novo)}</strong> aguardando o Dr. Maurício.{" "}
          {pedido.id && (
            <button type="button" onClick={() => cancelar(pedido.id)} disabled={enviando} className="ui-link">
              Cancelar pedido
            </button>
          )}
        </p>
      )}
      {abrir && !pedido && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-xs text-muted">Mudar um prazo precisa da autorização do Dr. Maurício.</p>
          <input type="date" value={nova} onChange={(e) => setNova(e.target.value)} aria-label="Novo prazo" className="ui-input" />
          <textarea value={just} onChange={(e) => setJust(e.target.value)} rows={3} maxLength={1000} placeholder="Justificativa: por que o prazo precisa mudar?" aria-label="Justificativa" className="ui-input" />
          <div className="flex gap-2">
            <button type="button" onClick={enviar} disabled={enviando} className="ui-btn px-3 py-1.5 text-xs">
              Enviar pedido
            </button>
            <button type="button" onClick={() => setAbrir(false)} className="ui-btn-secondary px-3 py-1.5 text-xs">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
