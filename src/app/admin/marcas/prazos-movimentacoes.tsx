"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";

// Principal → abas Movimentações e Prazos, com o filtro de texto em cima.

type PrazoTela = { id: string; nome: string; tipo: string; processo: string; acao: string; situacao: string; vence: string; cliente: string | null };
type MovTela = { id: number; nome: string; tipo: string; processo: string; despacho: string; data: string };

const DIA = 86_400_000;
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / DIA);
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const ROTULO_SIT: Record<string, string> = { pendente: "Pendente", realizado: "Realizado", perdido: "Perdido", dispensado: "Dispensado" };

export function PrazosMovimentacoes({ prazos, movimentacoes, hoje }: { prazos: PrazoTela[]; movimentacoes: MovTela[]; hoje: string }) {
  const [aba, setAba] = useState<"prazos" | "mov">("prazos");
  const [filtro, setFiltro] = useState("");
  const f = filtro.trim().toLowerCase();
  const bate = (...xs: (string | null)[]) => !f || xs.some((x) => x?.toLowerCase().includes(f));
  const listaPrazos = prazos.filter((p) => bate(p.nome, p.processo, p.acao, p.cliente));
  const listaMov = movimentacoes.filter((m) => bate(m.nome, m.processo, m.despacho));
  const abertos = prazos.filter((p) => p.situacao === "pendente").length;

  return (
    <section className="ui-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 pt-3">
        <nav className="flex gap-5" aria-label="Movimentações e prazos">
          {([
            ["mov", "Movimentações", movimentacoes.length],
            ["prazos", "Prazos", abertos],
          ] as const).map(([id, rotulo, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              aria-current={aba === id ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-2.5 text-[15px] transition-colors ${aba === id ? "border-navy-3 font-medium text-foreground" : "border-transparent text-foreground/65 hover:text-foreground"}`}
            >
              {rotulo}
              <span className={`rounded px-1.5 text-[11px] font-semibold ${n ? "bg-navy-3 text-white" : "bg-surface-2 text-muted"}`}>{n}</span>
            </button>
          ))}
        </nav>
        <div className="relative ml-auto mb-2 w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar prazos e colidências (processo, marca, ação, cliente…)"
            aria-label="Filtrar prazos e movimentações"
            className="h-9 w-full rounded-full border border-border bg-surface pr-3 pl-9 text-[13px] placeholder:text-muted focus:border-navy-3 focus:outline-none"
          />
        </div>
      </div>

      {aba === "prazos" ? (
        <>
          <p className="px-4 pt-3 text-sm font-medium text-foreground">
            Prazos administrativos do INPI <span className="text-muted">· {abertos}</span>
          </p>
          <ul className="divide-y divide-border">
            {listaPrazos.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Nenhum item corresponde ao filtro.</li>}
            {listaPrazos.map((p) => {
              const d = dias(hoje, p.vence);
              const feito = p.situacao !== "pendente";
              const cor = feito ? "text-muted" : d < 0 ? "text-status-danger" : d <= 7 ? "text-status-danger" : d <= 30 ? "text-status-pending" : "text-foreground/70";
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/marcas/processos/${p.processo}`} className="block truncate text-sm font-semibold text-foreground hover:underline">
                      {p.nome}
                    </Link>
                    <p className="text-xs text-muted">
                      <span className="capitalize">{p.tipo}</span> <span className="font-mono">{p.processo}</span>
                      {p.cliente ? ` · ${p.cliente}` : ""}
                    </p>
                  </div>
                  <p className="w-full text-sm text-foreground/85 sm:w-64">{p.acao}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${feito ? "bg-status-success-bg text-status-success" : "bg-status-pending-bg text-status-pending"}`}>
                    {ROTULO_SIT[p.situacao] ?? p.situacao}
                  </span>
                  <span className="w-28 text-right">
                    <span className="block text-sm tabular-nums text-foreground">{dataBR(p.vence)}</span>
                    <span className={`block text-xs font-semibold ${cor}`}>{feito ? "" : d < 0 ? `venceu há ${-d} dia(s)` : d === 0 ? "vence hoje" : `${d} dias`}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <ul className="divide-y divide-border">
          {listaMov.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Nenhum item corresponde ao filtro.</li>}
          {listaMov.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/marcas/processos/${m.processo}`} className="block truncate text-sm font-semibold text-foreground hover:underline">
                  {m.nome}
                </Link>
                <p className="text-xs text-muted">
                  <span className="capitalize">{m.tipo}</span> <span className="font-mono">{m.processo}</span>
                </p>
              </div>
              <p className="text-sm text-foreground/85 sm:max-w-md">{m.despacho}</p>
              <span className="w-24 text-right text-sm tabular-nums text-foreground/70">{dataBR(m.data)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
