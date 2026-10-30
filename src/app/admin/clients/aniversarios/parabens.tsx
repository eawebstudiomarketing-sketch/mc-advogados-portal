"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Cake, Check, Loader2, Send } from "lucide-react";
import { enviarParabensAction, salvarConfigAniversarioAction } from "./actions";

/** Botão do dia: abre o texto já preenchido, a pessoa revisa e envia. */
export function BotaoParabens({ clientId, texto, enviado }: { clientId: string; texto: string; enviado: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState(texto);
  const [pending, start] = useTransition();
  if (enviado)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-status-success-bg px-2.5 py-1 text-xs font-semibold text-status-success">
        <Check className="h-3.5 w-3.5" aria-hidden /> Parabéns enviado
      </span>
    );
  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="ui-btn-secondary h-8 px-3 text-xs">
        <Cake className="h-3.5 w-3.5" aria-hidden /> Enviar parabéns
      </button>
    );
  return (
    <div className="w-full max-w-md space-y-2">
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} className="ui-input text-sm" aria-label="Texto do parabéns" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setAberto(false)} className="ui-btn-secondary h-8 px-3 text-xs">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await enviarParabensAction(clientId, msg);
              if (!r.ok) return void toast.error(r.error);
              toast.success(`Parabéns na fila do WhatsApp (${r.rotulo})`);
              setAberto(false);
              router.refresh();
            })
          }
          className="ui-btn h-8 px-3 text-xs"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />} Enviar no WhatsApp
        </button>
      </div>
    </div>
  );
}

/** Cartão do admin: liga o envio automático das 09h e edita o texto-modelo. */
export function ConfigParabens({ ativo, mensagem, migrationAplicada }: { ativo: boolean; mensagem: string; migrationAplicada: boolean }) {
  const router = useRouter();
  const [liga, setLiga] = useState(ativo);
  const [texto, setTexto] = useState(mensagem);
  const [pending, start] = useTransition();
  const mudou = liga !== ativo || texto !== mensagem;
  return (
    <section className="ui-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">Parabéns automático</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Todo dia às 09h, quem faz aniversário recebe a mensagem abaixo no WhatsApp individual (nunca em grupo), uma vez por ano. Use {"{cliente}"} para o primeiro nome.
          </p>
        </div>
        <label className={`inline-flex items-center gap-2 text-sm font-medium ${migrationAplicada ? "cursor-pointer" : "opacity-50"}`}>
          <input type="checkbox" checked={liga} disabled={!migrationAplicada} onChange={(e) => setLiga(e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" />
          {liga ? "Ligado" : "Desligado"}
        </label>
      </div>
      {!migrationAplicada && <p className="mt-3 rounded-lg bg-status-pending-bg px-3 py-2 text-xs text-status-pending">Falta aplicar a atualização do banco (0058) para ligar o envio automático. O botão manual já funciona.</p>}
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} disabled={!migrationAplicada} className="ui-input mt-3 text-sm" aria-label="Texto-modelo do parabéns" />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={!mudou || pending || !migrationAplicada}
          onClick={() =>
            start(async () => {
              const r = await salvarConfigAniversarioAction(liga, texto);
              if (!r.ok) return void toast.error(r.error);
              toast.success(liga ? "Parabéns automático ligado" : "Configuração salva");
              router.refresh();
            })
          }
          className="ui-btn"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Salvar
        </button>
      </div>
    </section>
  );
}
