"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { FILTRO_VAZIO, PERIODOS, TIPOS, aplicarFiltro, periodoDe, type Filtro, type LinhaAtividade, type LinhaCliente, type LinhaResp } from "@/lib/painel/base";

// Dados do painel no navegador: cada quadro filtra sozinho (período,
// responsável, cliente/PF-PJ, tipo/área) sem voltar ao servidor.

type Ctx = {
  atividades: LinhaAtividade[];
  clientes: Map<string, LinhaCliente>;
  responsaveis: LinhaResp[];
  periodoPagina: string;
};
const PainelCtx = createContext<Ctx | null>(null);

export function PainelBase({
  atividades,
  clientes,
  responsaveis,
  periodoPagina,
  children,
}: {
  atividades: LinhaAtividade[];
  clientes: LinhaCliente[];
  responsaveis: LinhaResp[];
  periodoPagina: string;
  children: React.ReactNode;
}) {
  const valor = useMemo(() => ({ atividades, clientes: new Map(clientes.map((c) => [c.id, c])), responsaveis, periodoPagina }), [atividades, clientes, responsaveis, periodoPagina]);
  return <PainelCtx.Provider value={valor}>{children}</PainelCtx.Provider>;
}

export function usePainel() {
  const c = useContext(PainelCtx);
  if (!c) throw new Error("PainelBase ausente");
  return c;
}

type Campos = { periodo?: boolean; resp?: boolean; cliente?: boolean; tipo?: boolean };

/** Estado do filtro de um quadro + linhas já filtradas (sem o período, que cada quadro aplica do seu jeito). */
export function useFiltro(inicial: Partial<Filtro> = {}) {
  const { atividades, clientes, periodoPagina } = usePainel();
  const [filtro, setFiltro] = useState<Filtro>({ ...FILTRO_VAZIO, ...inicial });
  const linhas = useMemo(() => aplicarFiltro(atividades, filtro, clientes), [atividades, filtro, clientes]);
  const periodo = useMemo(() => periodoDe(filtro.periodo === "pagina" ? periodoPagina : filtro.periodo), [filtro.periodo, periodoPagina]);
  return { filtro, setFiltro, linhas, periodo };
}

export function FiltroQuadro({ filtro, setFiltro, campos = { periodo: true, resp: true, cliente: true, tipo: true } }: { filtro: Filtro; setFiltro: (f: Filtro) => void; campos?: Campos }) {
  const { atividades, clientes, responsaveis, periodoPagina } = usePainel();
  const [aberto, setAberto] = useState(false);
  const areas = useMemo(() => [...new Set(atividades.map((a) => a.area).filter((a): a is string => !!a))].sort(), [atividades]);
  const listaClientes = useMemo(() => [...clientes.values()].filter((c) => atividades.some((a) => a.clienteId === c.id)).sort((a, b) => a.nome.localeCompare(b.nome)), [clientes, atividades]);
  const ativos = [filtro.periodo !== "pagina" && campos.periodo, filtro.resp && campos.resp, filtro.cliente && campos.cliente, filtro.tipo && campos.tipo].filter(Boolean).length;
  const sel = "ui-input !w-auto max-w-[11rem] !py-1 !pl-2 !pr-7 text-xs";
  const rotuloPagina = PERIODOS.find((p) => p.id === periodoPagina)?.rotulo ?? "Este mês";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${ativos ? "border-navy/40 bg-navy/5 text-foreground dark:border-white/30" : "border-border text-muted hover:text-foreground"}`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        Filtros{ativos ? ` · ${ativos}` : ""}
      </button>
      {aberto && (
        <div className="flex w-full flex-wrap justify-end gap-1.5">
          {campos.periodo && (
            <select aria-label="Período" className={sel} value={filtro.periodo} onChange={(e) => setFiltro({ ...filtro, periodo: e.target.value })}>
              <option value="pagina">Período da página ({rotuloPagina})</option>
              {PERIODOS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          )}
          {campos.resp && (
            <select aria-label="Responsável" className={sel} value={filtro.resp} onChange={(e) => setFiltro({ ...filtro, resp: e.target.value })}>
              <option value="">Todos os responsáveis</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          )}
          {campos.cliente && (
            <select aria-label="Cliente" className={sel} value={filtro.cliente} onChange={(e) => setFiltro({ ...filtro, cliente: e.target.value })}>
              <option value="">Todos os clientes</option>
              <option value="PJ">Só empresas (PJ)</option>
              <option value="PF">Só pessoas físicas (PF)</option>
              {listaClientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
          {campos.tipo && (
            <select aria-label="Tipo ou área" className={sel} value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}>
              <option value="">Todos os tipos e áreas</option>
              <optgroup label="Tipo">
                {Object.entries(TIPOS).map(([v, r]) => (
                  <option key={v} value={`t:${v}`}>
                    {r}
                  </option>
                ))}
              </optgroup>
              {areas.length > 0 && (
                <optgroup label="Área">
                  {areas.map((a) => (
                    <option key={a} value={`a:${a}`}>
                      {a}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          {ativos > 0 && (
            <button type="button" className="px-1.5 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline" onClick={() => setFiltro(FILTRO_VAZIO)}>
              Limpar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Moldura de cada quadro: título, apoio e o filtro à direita. */
export function Quadro({ titulo, apoio, filtro, children, className = "" }: { titulo: string; apoio?: string; filtro?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`ui-card min-w-0 p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{titulo}</p>
          {apoio && <p className="mt-0.5 text-xs text-muted">{apoio}</p>}
        </div>
        {filtro}
      </div>
      {children}
    </div>
  );
}
