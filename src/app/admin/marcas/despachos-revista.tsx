"use client";

import Link from "next/link";
import { useState } from "react";

// Principal → "Despachos para os processos acompanhados" da última revista:
// Mostrar N processos por página, Filtrar e a paginação Primeira/Anterior/…/Última.

type Linha = { id: number; tipo: string; processo: string; titulo: string; despacho: string };

export function DespachosRevista({ linhas }: { linhas: Linha[] }) {
  const [porPagina, setPorPagina] = useState(10);
  const [filtro, setFiltro] = useState("");
  const [pagina, setPagina] = useState(1);
  const f = filtro.trim().toLowerCase();
  const filtradas = linhas.filter((l) => !f || [l.tipo, l.processo, l.titulo, l.despacho].some((x) => x.toLowerCase().includes(f)));
  const total = filtradas.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(pagina, paginas);
  const vis = filtradas.slice((atual - 1) * porPagina, atual * porPagina);
  const ir = (p: number) => setPagina(Math.min(paginas, Math.max(1, p)));
  const botao = "border border-border px-3.5 py-2 text-sm text-foreground/80 hover:bg-surface-2 disabled:opacity-50 -ml-px first:ml-0 first:rounded-l last:rounded-r";

  return (
    <div className="px-5 py-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="text-sm text-foreground">
          Mostrar
          <select
            value={porPagina}
            onChange={(e) => {
              setPorPagina(Number(e.target.value));
              setPagina(1);
            }}
            className="mt-1 block h-8 w-64 rounded border border-border bg-surface px-2 text-sm"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          processos por página
        </label>
        <label className="text-sm font-semibold text-foreground">
          Filtrar:
          <input
            type="search"
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value);
              setPagina(1);
            }}
            className="mt-1 block h-8 w-52 rounded border border-border bg-surface px-2 text-sm font-normal"
          />
        </label>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">Processo</th>
              <th className="px-3 py-2.5">Título</th>
              <th className="px-3 py-2.5">Despacho</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {vis.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted">
                  Nenhum despacho para os processos acompanhados nesta revista.
                </td>
              </tr>
            )}
            {vis.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2.5 text-sm capitalize">{l.tipo}</td>
                <td className="px-3 py-2.5 text-sm">
                  <Link href={`/admin/marcas/processos/${l.processo}`} className="text-navy-3 hover:underline">
                    {l.processo}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-sm">{l.titulo}</td>
                <td className="px-3 py-2.5 text-sm">{l.despacho}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground">
          Mostrando alerta(s) de {total ? (atual - 1) * porPagina + 1 : 0} até {Math.min(atual * porPagina, total)} de um total de {total} alerta(s)
        </p>
        <div className="flex">
          <button type="button" className={botao} disabled={atual === 1} onClick={() => ir(1)}>
            Primeira
          </button>
          <button type="button" className={botao} disabled={atual === 1} onClick={() => ir(atual - 1)}>
            Anterior
          </button>
          <span className="-ml-px border border-navy-3 bg-navy-3 px-3.5 py-2 text-sm text-white">{atual}</span>
          <button type="button" className={botao} disabled={atual === paginas} onClick={() => ir(atual + 1)}>
            Próxima
          </button>
          <button type="button" className={botao} disabled={atual === paginas} onClick={() => ir(paginas)}>
            Última
          </button>
        </div>
      </div>
    </div>
  );
}
