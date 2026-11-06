"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { COR_ETAPA, CORES, type Etapa, type EtapaTipo } from "@/lib/crm/tipos";
import { salvarEtapasAction } from "../actions";

// Etapas do funil: nome, cor, tipo (aberta, fechado/ganho, perdido) e ordem.

type Linha = { id: string; nome: string; cor: string; tipo: EtapaTipo };
const ROTULO_COR: Record<string, string> = { info: "Azul", navy: "Marinho", pending: "Laranja", gold: "Dourado", success: "Verde", danger: "Vermelho" };

export function EditorEtapas({ etapas }: { etapas: Etapa[] }) {
  const [linhas, setLinhas] = useState<Linha[]>(etapas.map((e) => ({ id: e.id, nome: e.nome, cor: e.cor, tipo: e.tipo })));
  const [salvando, iniciar] = useTransition();
  const mudar = (i: number, l: Partial<Linha>) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, ...l } : x)));
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= linhas.length) return;
    const c = [...linhas];
    [c[i], c[j]] = [c[j], c[i]];
    setLinhas(c);
  };
  return (
    <section className="ui-card space-y-4 p-5">
      <div>
        <h2 className="section-title">Etapas do funil</h2>
        <p className="text-sm text-muted">O lead novo entra na primeira etapa em andamento. “Fechado” avisa os anúncios da venda; uma etapa com “Reunião” no nome avisa de reunião marcada.</p>
      </div>
      <ul className="space-y-2">
        {linhas.map((l, i) => (
          <li key={l.id || `nova-${i}`} className="flex flex-wrap items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${(COR_ETAPA[l.cor] ?? COR_ETAPA.navy).ponto}`} aria-hidden />
            <input value={l.nome} onChange={(e) => mudar(i, { nome: e.target.value })} className="ui-input min-w-40 flex-1 py-1.5 text-sm" aria-label="Nome da etapa" />
            <select value={l.cor} onChange={(e) => mudar(i, { cor: e.target.value })} className="ui-input !w-auto py-1.5 text-sm" aria-label="Cor">
              {CORES.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_COR[c] ?? c}
                </option>
              ))}
            </select>
            <select value={l.tipo} onChange={(e) => mudar(i, { tipo: e.target.value as EtapaTipo })} className="ui-input !w-auto py-1.5 text-sm" aria-label="Tipo">
              <option value="aberta">Em andamento</option>
              <option value="ganho">Fechado (ganho)</option>
              <option value="perdido">Perdido</option>
            </select>
            <button type="button" onClick={() => mover(i, -1)} aria-label="Subir" className="rounded p-1.5 text-muted hover:bg-surface-2">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => mover(i, 1)} aria-label="Descer" className="rounded p-1.5 text-muted hover:bg-surface-2">
              <ArrowDown className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))} aria-label="Tirar etapa" className="rounded p-1.5 text-muted hover:bg-status-danger-bg hover:text-status-danger">
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" onClick={() => setLinhas([...linhas, { id: "", nome: "", cor: "navy", tipo: "aberta" }])} className="ui-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
          <Plus className="h-4 w-4" aria-hidden /> Etapa
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() =>
            iniciar(async () => {
              const r = await salvarEtapasAction(linhas);
              if (r.ok) toast.success("Etapas salvas.");
              else toast.error(r.erro);
            })
          }
          className="ui-btn px-5 py-2 text-sm"
        >
          {salvando ? "Salvando…" : "Salvar etapas"}
        </button>
      </div>
    </section>
  );
}
