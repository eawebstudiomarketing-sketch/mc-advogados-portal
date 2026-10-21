"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { EscritorioConfig } from "@/lib/data/escritorio";
import { salvarZapConfigAction } from "./actions";

// Textos do lembrete de reunião que vai para o cliente (24h e 1h antes) e
// as chaves gerais dos envios automáticos pelo WhatsApp.

const EXEMPLO = { titulo: "reunião de alinhamento", data: "sexta, 17/10", hora: "10:00", local: " Local: Google Meet." };
const aplicar = (t: string) =>
  t.replaceAll("{titulo}", EXEMPLO.titulo).replaceAll("{data}", EXEMPLO.data).replaceAll("{hora}", EXEMPLO.hora).replaceAll("{local}", EXEMPLO.local);

export function ZapConfig({ config }: { config: EscritorioConfig }) {
  const [c, setC] = useState(config);
  const [pending, start] = useTransition();
  const mudou = JSON.stringify(c) !== JSON.stringify(config);

  function salvar() {
    start(async () => {
      const r = await salvarZapConfigAction({
        lembrete_24h: c.lembrete_24h,
        lembrete_1h: c.lembrete_1h,
        lembretes_ativos: c.lembretes_ativos,
        rotina_ativa: c.rotina_ativa,
      });
      if (r.ok) toast.success("Envios do WhatsApp salvos.");
      else toast.error(r.error);
    });
  }

  return (
    <div className="ui-card p-4">
      <p className="text-sm font-medium text-foreground">Envios automáticos pelo WhatsApp</p>
      <p className="text-xs text-muted">Saem pelo número conectado na tela WhatsApp. Com o Agente desligado, ficam na fila e saem quando ele ligar.</p>

      <div className="mt-3 space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={c.rotina_ativa} onChange={(e) => setC({ ...c, rotina_ativa: e.target.checked })} className="h-4 w-4 accent-[var(--navy)]" />
          Rotina do dia para cada pessoa às 8h (segunda a sexta)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={c.lembretes_ativos} onChange={(e) => setC({ ...c, lembretes_ativos: e.target.checked })} className="h-4 w-4 accent-[var(--navy)]" />
          Lembrete de reunião para o cliente (24h e 1h antes)
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {([
          ["lembrete_24h", "Lembrete 24 horas antes"],
          ["lembrete_1h", "Lembrete 1 hora antes"],
        ] as const).map(([campo, rotulo]) => (
          <div key={campo}>
            <label htmlFor={campo} className="text-xs font-medium text-foreground">
              {rotulo}
            </label>
            <textarea id={campo} value={c[campo]} onChange={(e) => setC({ ...c, [campo]: e.target.value })} rows={3} className="ui-input mt-1 text-sm" />
            <p className="mt-1 rounded-lg bg-surface-2 px-3 py-2 text-xs text-foreground/80">
              <span className="text-muted">Fica assim: </span>
              {aplicar(c[campo])}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Use <code>{"{titulo}"}</code>, <code>{"{data}"}</code>, <code>{"{hora}"}</code> e <code>{"{local}"}</code>; o sistema troca pelos dados do compromisso.
      </p>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={salvar} disabled={!mudou || pending} className="ui-btn px-4 py-2 text-sm">
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
