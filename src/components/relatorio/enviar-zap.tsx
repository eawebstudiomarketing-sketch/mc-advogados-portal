"use client";

import { useState, useTransition } from "react";
import { FileText, Loader2, MessageCircle, Send, Users, X } from "lucide-react";
import { toast } from "sonner";
import { buscarConversaZapAction, enviarRelatorioZapAction, prepararEnvioRelatorioAction, type DestinoZap } from "@/app/admin/reports/zap-actions";

/** Botão "Enviar no WhatsApp": escolhe a conversa do cliente, confere a mensagem pronta e envia com o PDF. */
export function EnviarRelatorioZap({ reportId }: { reportId: string }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState<{ destinos: DestinoZap[]; arquivo: string; agenteNoAr: boolean } | null>(null);
  const [destino, setDestino] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, start] = useTransition();
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<DestinoZap[]>([]);
  const [extras, setExtras] = useState<DestinoZap[]>([]);
  async function buscar(t: string) {
    setBusca(t);
    setAchados(t.trim().length >= 2 ? await buscarConversaZapAction(t) : []);
  }

  async function abrir() {
    setAberto(true);
    setCarregando(true);
    const r = await prepararEnvioRelatorioAction(reportId);
    setCarregando(false);
    if (!r.ok) {
      toast.error(r.erro);
      setAberto(false);
      return;
    }
    setDados(r);
    setTexto(r.mensagem);
    setDestino(r.destinos.find((d) => d.sugerido)?.jid ?? r.destinos[0]?.jid ?? "");
  }

  function enviar() {
    start(async () => {
      const r = await enviarRelatorioZapAction(reportId, destino, texto);
      if (!r.ok) return void toast.error(r.erro);
      toast.success("Relatório enviado no WhatsApp.", { description: dados?.destinos.find((d) => d.jid === destino)?.nome });
      setAberto(false);
    });
  }

  return (
    <>
      <button type="button" onClick={() => void abrir()} className="icon-btn" aria-label="Enviar no WhatsApp" data-tip="Enviar no WhatsApp">
        <MessageCircle aria-hidden />
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Enviar relatório no WhatsApp" onClick={() => setAberto(false)}>
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <MessageCircle className="h-5 w-5 text-zap-ink" aria-hidden />
              <p className="flex-1 font-semibold text-foreground">Enviar relatório no WhatsApp</p>
              <button type="button" onClick={() => setAberto(false)} className="icon-btn" aria-label="Fechar">
                <X aria-hidden />
              </button>
            </div>
            {carregando || !dados ? (
              <div className="flex justify-center py-12 text-muted">
                <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" />
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {!dados.agenteNoAr && <p className="rounded-xl bg-status-danger-bg px-3 py-2 text-xs text-status-danger">O WhatsApp do escritório está fora do ar agora: o envio não vai sair.</p>}
                <div>
                  <p className="ui-label">Para</p>
                  {dados.destinos.length + extras.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border-strong px-3 py-3 text-sm text-muted">
                      Este cliente não tem conversa nem grupo ligado no WhatsApp. Busque a conversa abaixo (ou ligue na ficha do cliente, card WhatsApp).
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {[...dados.destinos, ...extras].map((d) => (
                        <li key={d.jid}>
                          <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${destino === d.jid ? "border-navy-3 bg-navy/[0.04]" : "border-border hover:border-border-strong"}`}>
                            <input type="radio" name="destino" checked={destino === d.jid} onChange={() => setDestino(d.jid)} className="accent-[var(--navy)]" />
                            {d.grupo && <Users className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                            <span className="min-w-0 flex-1 truncate text-foreground">{d.nome}</span>
                            {d.sugerido && <span className="shrink-0 rounded-full bg-zap-bg px-2 py-px text-[10px] font-semibold text-zap-ink">sugerido</span>}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2">
                    <input
                      value={busca}
                      onChange={(e) => void buscar(e.target.value)}
                      placeholder="Mandar pra outra conversa (nome ou número)"
                      aria-label="Buscar outra conversa"
                      className="ui-input !py-1.5 text-sm"
                    />
                    {achados.length > 0 && (
                      <ul className="mt-1 rounded-xl border border-border">
                        {achados.map((d) => (
                          <li key={d.jid}>
                            <button
                              type="button"
                              onClick={() => {
                                setExtras((xs) => (xs.some((x) => x.jid === d.jid) || dados.destinos.some((x) => x.jid === d.jid) ? xs : [...xs, d]));
                                setDestino(d.jid);
                                setBusca("");
                                setAchados([]);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-2"
                            >
                              {d.grupo && <Users className="h-3.5 w-3.5 text-muted" aria-hidden />}
                              <span className="truncate">{d.nome}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div>
                  <label htmlFor="msg-relatorio" className="ui-label">
                    Mensagem <span className="font-normal text-muted">(pode editar)</span>
                  </label>
                  <textarea id="msg-relatorio" value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} className="ui-input text-sm" />
                  <p className="mt-1 text-[11px] text-muted">*negrito* e _itálico_ funcionam como no WhatsApp.</p>
                </div>
                <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-foreground/80">
                  <FileText className="h-4 w-4 shrink-0 text-status-danger" aria-hidden /> {dados.arquivo}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={() => setAberto(false)} className="ui-btn-secondary">
                Cancelar
              </button>
              <button type="button" onClick={enviar} disabled={!destino || !texto.trim() || enviando || !dados?.agenteNoAr} className="ui-btn">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
