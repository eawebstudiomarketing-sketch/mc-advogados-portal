"use client";

import { useState, useTransition } from "react";
import { CheckCheck, MessageCircle } from "lucide-react";
import { enviarAvisoAction, prepararAvisoAction } from "@/app/admin/activities/aviso-cliente";

// "Avisar o cliente no Zap" na atividade concluída: mostra o texto, deixa
// editar e só envia com a confirmação. O selo evita aviso em dobro sem querer.

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function AvisarCliente({
  atividadeId,
  avisadoEm: inicial,
  podeSalvarModelo,
  onAvisou,
}: {
  atividadeId: string;
  avisadoEm: string | null;
  podeSalvarModelo: boolean;
  onAvisou?: (iso: string) => void;
}) {
  const [avisadoEm, setAvisadoEm] = useState(inicial);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [destino, setDestino] = useState("");
  const [salvar, setSalvar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function abrir() {
    setErro(null);
    start(async () => {
      const r = await prepararAvisoAction(atividadeId);
      if (!r.ok) return setErro(r.error);
      setTexto(r.texto);
      setDestino(r.destino);
      setSalvar(false);
      setAberto(true);
    });
  }
  function enviar() {
    setErro(null);
    start(async () => {
      const r = await enviarAvisoAction(atividadeId, texto, salvar);
      if (!r.ok) return setErro(r.error);
      setAvisadoEm(r.avisadoEm);
      onAvisou?.(r.avisadoEm);
      setAberto(false);
    });
  }

  return (
    <div className="mt-5 rounded-xl border border-border bg-surface-2/50 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Aviso ao cliente</p>
          {avisadoEm ? (
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-status-success">
              <CheckCheck className="h-4 w-4" aria-hidden /> Cliente avisado em {quando(avisadoEm)}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">O cliente ainda não foi avisado de que esta demanda foi concluída.</p>
          )}
        </div>
        {!aberto && (
          <button type="button" onClick={abrir} disabled={pending} className="ui-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            {pending ? "Abrindo…" : avisadoEm ? "Avisar de novo" : "Avisar no Zap"}
          </button>
        )}
      </div>

      {aberto && (
        <div className="mt-3 space-y-2.5">
          <p className="text-xs text-muted">Vai para o {destino}. Confira e edite o texto antes de enviar.</p>
          <label htmlFor="aviso-texto" className="sr-only">
            Texto do aviso
          </label>
          <textarea id="aviso-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} maxLength={1500} className="ui-input w-full resize-y text-sm" />
          {podeSalvarModelo && (
            <label className="flex items-center gap-2 text-xs text-foreground/80">
              <input type="checkbox" checked={salvar} onChange={(e) => setSalvar(e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" />
              Salvar este texto como o padrão dos próximos avisos
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={enviar} disabled={pending || texto.trim().length < 5} className="ui-btn inline-flex items-center gap-1.5 px-4 py-2 text-sm">
              <MessageCircle className="h-4 w-4" aria-hidden />
              {pending ? "Enviando…" : "Enviar para o cliente"}
            </button>
            <button type="button" onClick={() => setAberto(false)} disabled={pending} className="ui-btn-secondary px-4 py-2 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && <p className="mt-2 text-sm text-status-danger">{erro}</p>}
    </div>
  );
}
