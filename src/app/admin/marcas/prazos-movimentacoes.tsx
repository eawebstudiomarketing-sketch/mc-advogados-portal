"use client";

import Link from "next/link";
import { formatarProcesso } from "@/lib/marcas/formato";
import { useState } from "react";

// Principal → "Movimentações": caixa Prazos (N itens para atenção) com o filtro
// e a lista "Prazos administrativos do INPI", igual ao Marca Acompanhada.

type PrazoTela = { id: string; nome: string; tipo: string; processo: string; acao: string; situacao: string; vence: string; cliente: string | null };
type ColidTela = { id: string; nome: string; tipo: string; processo: string; acao: string };

const DIA = 86_400_000;
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / DIA);
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const ROTULO_SIT: Record<string, string> = { pendente: "Pendente", realizado: "Realizado", perdido: "Perdido", dispensado: "Dispensado" };

export function PrazosMovimentacoes({ prazos, colidencias, hoje }: { prazos: PrazoTela[]; colidencias: ColidTela[]; hoje: string }) {
  const [filtro, setFiltro] = useState("");
  const f = filtro.trim().toLowerCase();
  const bate = (...xs: (string | null)[]) => !f || xs.some((x) => x?.toLowerCase().includes(f));
  const abertos = prazos.filter((p) => p.situacao === "pendente");
  const listaPrazos = abertos.filter((p) => bate(p.nome, p.processo, p.acao, p.cliente));
  const listaColid = colidencias.filter((c) => bate(c.nome, c.processo, c.acao));

  return (
    <section className="ui-card overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold text-foreground">Prazos</h3>
        <span className="rounded-md border border-border px-2 py-0.5 text-xs text-foreground">{abertos.length + colidencias.length} itens para atenção</span>
      </div>
      <div className="px-4 pt-3 pb-1">
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar prazos e colidências (processo, marca, ação, cliente...)"
          aria-label="Filtrar prazos e colidências"
          className="h-8 w-full rounded border border-border bg-surface px-2.5 text-sm placeholder:text-muted focus:border-navy-3 focus:outline-none"
        />
      </div>
      <div className="max-h-[520px] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-5">
          <h4 className="text-[15px] font-semibold text-foreground">Prazos administrativos do INPI</h4>
          <span className="text-sm text-foreground/70">{abertos.length}</span>
        </div>
        <ul className="divide-y divide-border">
          {listaPrazos.length === 0 && <li className="px-5 py-6 text-center text-sm text-muted">{f ? "Nenhum item corresponde ao filtro." : "Nenhum prazo em aberto."}</li>}
          {listaPrazos.map((p) => {
            const d = dias(hoje, p.vence);
            const cor = d <= 7 ? "text-status-danger" : d <= 30 ? "text-status-pending" : "text-foreground/80";
            return (
              <li key={p.id} className="grid grid-cols-1 items-center gap-x-6 gap-y-1 px-5 py-3.5 sm:grid-cols-[1fr_1fr_auto_110px]">
                <div className="min-w-0">
                  <Link href={`/admin/marcas/processos/${p.processo}`} className="text-sm font-semibold text-foreground uppercase hover:underline">
                    {p.nome}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                    <span className="selo-ma rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">{p.tipo}</span>
                    {formatarProcesso(p.processo)}
                  </p>
                </div>
                <p className="text-sm text-foreground/80">{p.acao}</p>
                <span className="text-sm font-semibold text-status-pending">{ROTULO_SIT[p.situacao] ?? p.situacao}</span>
                <span className="text-right">
                  <span className={`block text-sm tabular-nums ${d <= 30 ? `font-semibold ${cor}` : "text-foreground/80"}`}>{dataBR(p.vence)}</span>
                  <span className={`block text-xs ${cor}`}>{d < 0 ? `venceu há ${-d} dia(s)` : d === 0 ? "vence hoje" : `${d} dias`}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {colidencias.length > 0 && (
          <>
            <div className="flex items-center justify-between border-y border-border px-5 py-5">
              <h4 className="text-[15px] font-semibold text-foreground">Colidências</h4>
              <span className="text-sm text-foreground/70">{colidencias.length}</span>
            </div>
            <ul className="divide-y divide-border">
              {listaColid.map((c) => (
                <li key={c.id} className="grid grid-cols-1 items-center gap-x-6 gap-y-1 px-5 py-3.5 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="min-w-0">
                    <Link href={`/admin/marcas/processos/${c.processo}`} className="text-sm font-semibold text-foreground uppercase hover:underline">
                      {c.nome}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                      <span className="selo-ma rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">{c.tipo}</span>
                      {c.processo}
                    </p>
                  </div>
                  <p className="text-sm text-foreground/80">{c.acao}</p>
                  <Link href="/admin/marcas/colidencias" className="text-sm font-semibold text-navy-3 hover:underline">
                    Analisar
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
