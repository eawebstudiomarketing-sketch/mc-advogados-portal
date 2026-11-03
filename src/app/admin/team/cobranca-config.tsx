"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { salvarConfigCobrancaAction } from "@/app/admin/activities/cobranca-actions";
import type { ConfigCobranca } from "@/lib/cobrancas";

// Padrão da cobrança de documento (03/11/2026): intervalo, horário, quando avisar
// a equipe e o texto. Cada atividade pode mudar o próprio intervalo e texto.

const EXEMPLO = { cliente: "Ana", titulo: "Ação trabalhista", documentos: "RG e comprovante de residência" };
const aplicar = (t: string) => t.replaceAll("{cliente}", EXEMPLO.cliente).replaceAll("{titulo}", EXEMPLO.titulo).replaceAll("{documentos}", EXEMPLO.documentos);

export function CobrancaConfig({ config }: { config: ConfigCobranca }) {
  const [c, setC] = useState(config);
  const [pending, start] = useTransition();
  const mudou = JSON.stringify(c) !== JSON.stringify(config);
  const num = (campo: keyof Omit<ConfigCobranca, "mensagem">, min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={c[campo]}
      onChange={(e) => setC({ ...c, [campo]: Number(e.target.value) || min })}
      className="ui-input !w-20 !py-1.5 text-sm"
      aria-label={campo}
    />
  );

  function salvar() {
    start(async () => {
      const r = await salvarConfigCobrancaAction(c);
      if (r.ok) toast.success("Cobrança de documento salva.");
      else toast.error(r.erro);
    });
  }

  return (
    <div className="ui-card p-4">
      <p className="text-sm font-medium text-foreground">Cobrança de documento do cliente</p>
      <p className="text-xs text-muted">
        Quando uma atividade depende de documento do cliente, o portal cobra no WhatsApp até chegar. Este é o padrão; quem cria a atividade pode mudar o intervalo e o texto (ou gerar com IA).
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          Cobrar a cada {num("intervaloDias", 1, 30)} dia(s) útil(eis)
        </label>
        <label className="flex items-center gap-2">
          das {num("horaInicio", 6, 20)}h às {num("horaFim", 7, 22)}h
        </label>
        <label className="flex items-center gap-2">
          avisar a equipe depois de {num("avisarApos", 1, 50)} cobranças sem resposta
        </label>
      </div>

      <div className="mt-4">
        <label htmlFor="cobranca-msg" className="text-xs font-medium text-foreground">
          Texto padrão ({"{cliente}"}, {"{titulo}"} e {"{documentos}"} se preenchem sozinhos)
        </label>
        <textarea id="cobranca-msg" value={c.mensagem} onChange={(e) => setC({ ...c, mensagem: e.target.value })} rows={3} maxLength={2000} className="ui-input mt-1 text-sm" />
        <p className="mt-1 rounded-lg bg-surface-2 px-3 py-2 text-xs text-foreground/80">
          <span className="text-muted">Fica assim: </span>
          {aplicar(c.mensagem)}
        </p>
      </div>

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={salvar} disabled={!mudou || pending} className="ui-btn px-4 py-1.5 text-sm">
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
