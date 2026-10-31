"use client";

import { useState } from "react";
import { Search } from "lucide-react";

// Lista "Por Ano" das revistas, com a busca por número ou data em tempo real.

export type LinhaRevista = { numero: number; data: string; pdfs: string[]; nossos: number; colidencias: number; lida: boolean };
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function ListaRevistas({ revistas }: { revistas: LinhaRevista[] }) {
  const [busca, setBusca] = useState("");
  const f = busca.trim();
  const vistas = f ? revistas.filter((r) => String(r.numero).includes(f) || dataBR(r.data).includes(f)) : revistas;
  const anos = [...new Set(vistas.map((r) => r.data.slice(0, 4)))].sort().reverse();
  return (
    <section className="ui-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="section-title mr-auto">Buscar Revista</h2>
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Buscar por número da RPI ou data</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número da RPI ou data" className="h-9 w-full rounded-full border border-border bg-surface pr-3 pl-9 text-[13px] focus:border-navy-3 focus:outline-none" />
        </label>
        <span className="text-xs text-muted">A busca filtra em tempo real</span>
      </div>
      {anos.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Nenhuma revista encontrada.</p>}
      {anos.map((ano) => {
        const doAno = vistas.filter((r) => r.data.startsWith(ano));
        return (
          <div key={ano} className="border-b border-border last:border-0">
            <p className="bg-surface-2 px-4 py-2 text-sm font-semibold text-foreground">
              {ano} <span className="font-normal text-muted">· {doAno.length} revistas</span>
            </p>
            <ul className="divide-y divide-border">
              {doAno.map((r) => (
                <li key={r.numero} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="w-20 font-semibold">RPI {r.numero}</span>
                  <span className="w-24 tabular-nums text-foreground/75">{dataBR(r.data)}</span>
                  <span className="flex gap-2">
                    {r.pdfs.length > 1
                      ? r.pdfs.map((u, i) => (
                          <a key={u} href={u} target="_blank" rel="noreferrer" className="ui-link">
                            Vol. {i === 0 ? "I" : "II"}
                          </a>
                        ))
                      : r.pdfs.map((u) => (
                          <a key={u} href={u} target="_blank" rel="noreferrer" className="ui-link">
                            PDF
                          </a>
                        ))}
                  </span>
                  <span className="ml-auto text-xs text-muted">
                    {r.nossos ? `${r.nossos} despacho(s) da carteira` : "sem despachos da carteira"}
                    {r.colidencias ? ` · ${r.colidencias} colidência(s)` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
