"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { destinoZapDoClienteAction, gerarMensagemAtividadeAction } from "@/app/admin/activities/mensagem-actions";

// Mensagem automática no WhatsApp do cliente, criada junto com a atividade
// (04/11/2026): marca, escreve (ou pede para a IA), escolhe dia, horário e se
// repete. Vira uma mensagem agendada (zap_agendamentos) ligada à atividade.

const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const valor = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value ?? "";

export function MensagemZapCampos({ clienteId }: { clienteId: string }) {
  const [ligado, setLigado] = useState(false);
  const [texto, setTexto] = useState("");
  const [pedido, setPedido] = useState("");
  const [destino, setDestino] = useState<string | null | undefined>(undefined);
  const [gerando, start] = useTransition();

  useEffect(() => {
    if (!ligado || !clienteId) return;
    let vivo = true;
    void destinoZapDoClienteAction(clienteId).then((d) => vivo && setDestino(d));
    return () => {
      vivo = false;
    };
  }, [ligado, clienteId]);

  function gerar() {
    start(async () => {
      const tipo = document.getElementById("type") as HTMLSelectElement | null;
      const r = await gerarMensagemAtividadeAction({
        clientId: clienteId,
        titulo: valor("title"),
        descricao: valor("description"),
        tipo: tipo?.selectedOptions[0]?.text,
        data: valor("deadline"),
        hora: valor("hora"),
        pedido,
      });
      if (!r.ok || !r.mensagem) return void toast.error(r.erro ?? "A IA não conseguiu escrever agora.");
      setTexto(r.mensagem);
    });
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" name="zap_auto" checked={ligado} onChange={(e) => setLigado(e.target.checked)} className="mt-0.5 accent-navy" />
        <span>
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <MessageCircle className="h-4 w-4 text-muted" aria-hidden /> Mensagem automática no WhatsApp do cliente
          </span>
          <span className="block text-xs text-muted">Escreva a mensagem (ou deixe a IA montar) e escolha quando ela sai, sozinha, pelo número do escritório.</span>
        </span>
      </label>
      {ligado && (
        <div className="mt-3 space-y-3 pl-6">
          {!clienteId ? (
            <p className="text-xs font-medium text-status-danger">Escolha o cliente lá em cima: a mensagem vai para o WhatsApp dele.</p>
          ) : (
            <p className="text-xs text-muted">{destino === undefined ? "Conferindo o WhatsApp do cliente…" : destino ? `Vai para: ${destino}.` : "Este cliente não tem WhatsApp vinculado (grupo, contato ou número na ficha)."}</p>
          )}
          <div>
            <label htmlFor="zap_texto" className="ui-label">
              Mensagem
            </label>
            <textarea id="zap_texto" name="zap_texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={4000} required placeholder="Olá! Passando para lembrar…" className="ui-input" />
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={300} placeholder="Pedido para a IA (opcional): lembrar da audiência, pedir documento…" className="ui-input min-w-0 flex-1 !py-1.5 text-xs" aria-label="Pedido para a IA" />
              <button type="button" onClick={gerar} disabled={gerando || !clienteId} className="ui-btn-secondary px-3 py-1.5 text-xs">
                {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />} Escrever com IA
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">A IA usa o título, a descrição, o tipo, o prazo e o horário que você preencheu acima.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="zap_data" className="ui-label">
                Envia em
              </label>
              <input id="zap_data" name="zap_data" type="date" min={hojeBahia()} defaultValue={hojeBahia()} required className="ui-input" />
            </div>
            <div>
              <label htmlFor="zap_hora" className="ui-label">
                Às
              </label>
              <input id="zap_hora" name="zap_hora" type="time" defaultValue="09:00" required className="ui-input" />
            </div>
            <div>
              <label htmlFor="zap_repeticao" className="ui-label">
                Repete
              </label>
              <select id="zap_repeticao" name="zap_repeticao" defaultValue="unica" className="ui-input">
                <option value="unica">Não, só uma vez</option>
                <option value="uteis">Todo dia útil</option>
                <option value="semanal">Toda semana (mesmo dia)</option>
                <option value="mensal">Todo mês (mesmo dia)</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
