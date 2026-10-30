"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { salvarPreferenciaAction } from "./notificacoes-actions";
import { FORMATOS, type Canal, type Formato, type TipoAviso } from "@/lib/notificacoes-tipos";

// Minha conta › Notificações: o que o sistema pode mandar a você, por WhatsApp e por e-mail.
// Cada mudança é salva na hora.

const CANAL: Record<Canal, string> = { zap: "WhatsApp", email: "E-mail" };
type Estado = Record<string, { ativo: boolean; formato: Formato }>;

export function NotificacoesForm({ tipos, inicial }: { tipos: TipoAviso[]; inicial: Estado }) {
  const [estado, setEstado] = useState<Estado>(inicial);
  const [, start] = useTransition();
  const chave = (tipo: string, canal: Canal) => `${tipo}|${canal}`;
  const atual = (tipo: string, canal: Canal) => estado[chave(tipo, canal)] ?? { ativo: true, formato: "completa" as Formato };

  function mudar(tipo: string, canal: Canal, parte: Partial<{ ativo: boolean; formato: Formato }>) {
    const antes = atual(tipo, canal);
    const novo = { ...antes, ...parte };
    setEstado((e) => ({ ...e, [chave(tipo, canal)]: novo }));
    start(async () => {
      const r = await salvarPreferenciaAction(tipo, canal, novo.ativo, novo.formato);
      if (!r.ok) {
        setEstado((e) => ({ ...e, [chave(tipo, canal)]: antes }));
        toast.error(r.erro);
      }
    });
  }

  return (
    <section aria-label="Notificações" className="space-y-3">
      <div>
        <h2 className="section-title">Notificações</h2>
        <p className="mt-0.5 text-sm text-muted">Escolha o que o sistema pode mandar para você e como. Desligou, para de chegar; não muda nada para o resto da equipe.</p>
      </div>
      <ul className="space-y-3">
        {tipos.map((t) => (
          <li key={t.id} className="ui-card p-4">
            <p className="text-sm font-medium text-foreground">{t.rotulo}</p>
            <p className="mt-0.5 text-xs text-muted">{t.descricao}</p>
            <ul className="mt-3 space-y-2">
              {t.canais.map((c) => {
                const p = atual(t.id, c);
                return (
                  <li key={c} className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={p.ativo}
                      aria-label={`${t.rotulo} por ${CANAL[c]}`}
                      onClick={() => mudar(t.id, c, { ativo: !p.ativo })}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${p.ativo ? "bg-navy" : "bg-border-strong"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${p.ativo ? "translate-x-5" : ""}`} />
                    </button>
                    <span className="w-20 text-sm text-foreground">{CANAL[c]}</span>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      Mensagem
                      <select
                        value={p.formato}
                        disabled={!p.ativo}
                        onChange={(e) => mudar(t.id, c, { formato: e.target.value as Formato })}
                        aria-label={`Formato de ${t.rotulo} por ${CANAL[c]}`}
                        className="ui-input !w-auto !py-1 text-sm"
                      >
                        {(Object.keys(FORMATOS) as Formato[]).map((f) => (
                          <option key={f} value={f}>
                            {FORMATOS[f].rotulo}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
