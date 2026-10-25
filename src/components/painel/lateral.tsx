"use client";

import Link from "next/link";
import { aberta, dataBahia, hojeBahia, notaPessoa, periodoDe, somaDias } from "@/lib/painel/base";
import { usePainel } from "./contexto";
import { Anel, Medidor } from "./graficos2";
import { Avatar } from "./pessoas";

// Coluna ao lado do resumo do gerente (24/10/2026, escolha do usuário):
// 1) saúde do escritório, 2) placar da equipe, 3) hoje e amanhã na agenda.

export type CompromissoLateral = { id: string; titulo: string; inicio: string; clienteId: string | null; participantes: string[] };

const PARTES: { chave: string; rotulo: string; max: number }[] = [
  { chave: "prazo", rotulo: "Entregas no prazo", max: 25 },
  { chave: "resposta", rotulo: "Rapidez no WhatsApp", max: 20 },
  { chave: "satisfacao", rotulo: "Satisfação", max: 20 },
  { chave: "atrasos", rotulo: "Poucas atrasadas", max: 15 },
  { chave: "distribuicao", rotulo: "Distribuição em dia", max: 10 },
  { chave: "sistema", rotulo: "Robôs", max: 10 },
];
const cor = (pct: number) => (pct >= 75 ? "var(--status-success)" : pct >= 50 ? "var(--status-pending)" : "var(--status-danger)");

function Bloco({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        {acao}
      </div>
      {children}
    </div>
  );
}

export function LateralGerente({ saude, componentes, equipe, compromissos }: { saude: number; componentes: Record<string, number>; equipe: string[]; compromissos: CompromissoLateral[] }) {
  const { atividades, responsaveis, clientes, periodoPagina } = usePainel();
  const p = periodoDe(periodoPagina);
  const hoje = hojeBahia();
  const amanha = somaDias(hoje, 1);

  const placar = responsaveis
    .filter((r) => equipe.includes(r.id))
    .map((r) => ({ r, n: notaPessoa(atividades.filter((a) => a.respId === r.id), p.ini, p.fim) }))
    .sort((a, b) => (b.n.nota ?? -1) - (a.n.nota ?? -1));

  // agenda: compromissos + atividades com data hoje/amanhã
  type Item = { id: string; dia: string; hora: string | null; titulo: string; cliente: string | null; respIds: string[]; tipo: "reuniao" | "audiencia" | "prazo" | "tarefa"; href: string };
  const itens: Item[] = [
    ...compromissos.map((c) => ({
      id: `c-${c.id}`,
      dia: dataBahia(c.inicio),
      hora: new Date(c.inicio).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" }),
      titulo: c.titulo,
      cliente: c.clienteId ? clientes.get(c.clienteId)?.nome ?? null : null,
      respIds: c.participantes,
      tipo: "reuniao" as const,
      href: `/admin/agenda/compromisso/${c.id}`,
    })),
    ...atividades
      .filter((a) => aberta(a) && (a.prazo === hoje || a.prazo === amanha))
      .map((a) => ({
        id: a.id,
        dia: a.prazo!,
        hora: a.hora,
        titulo: a.titulo,
        cliente: a.clienteId ? clientes.get(a.clienteId)?.nome ?? null : null,
        respIds: a.respId ? [a.respId] : [],
        tipo: (a.categoria === "audiencia" ? "audiencia" : a.categoria === "prazo" ? "prazo" : "tarefa") as Item["tipo"],
        href: `/admin/activities/${a.id}`,
      })),
  ].sort((a, b) => (a.dia + (a.hora ?? "99")).localeCompare(b.dia + (b.hora ?? "99")));
  const etiqueta = { reuniao: "Reunião", audiencia: "Audiência", prazo: "Prazo", tarefa: "" };
  const corEtiqueta = { reuniao: "bg-status-info-bg text-status-info", audiencia: "bg-status-info-bg text-status-info", prazo: "bg-status-pending-bg text-status-pending", tarefa: "" };

  return (
    <aside className="space-y-4" aria-label="Resumo rápido">
      <Bloco titulo="Saúde do escritório">
        <Medidor valor={saude} rotulo={saude >= 75 ? "saudável" : saude >= 50 ? "pede atenção" : "crítico"} />
        <ul className="mt-3 space-y-1.5">
          {PARTES.map((x) => {
            const v = componentes[x.chave] ?? 0;
            const pct = (v / x.max) * 100;
            return (
              <li key={x.chave} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 text-[11px]">
                <span className="truncate text-muted">{x.rotulo}</span>
                <span className="h-1.5 rounded-full bg-surface-2">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: cor(pct) }} />
                </span>
                <span className="tabular-nums text-foreground">
                  {v}/{x.max}
                </span>
              </li>
            );
          })}
        </ul>
      </Bloco>

      <Bloco
        titulo="Placar da equipe"
        acao={
          <Link href="/admin/painel?aba=responsaveis" className="text-[11px] text-muted hover:text-foreground hover:underline">
            ver equipe
          </Link>
        }
      >
        <ul className="space-y-2.5">
          {placar.map(({ r, n }) => (
            <li key={r.id}>
              <Link href={`/admin/painel?aba=responsaveis&pessoa=${r.id}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-[var(--hover)]">
                <Avatar nome={r.nome} foto={r.foto} tamanho={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{r.nome}</span>
                  <span className="block text-[11px] text-muted">
                    {n.concluidas} entregue{n.concluidas === 1 ? "" : "s"} · {n.abertas} aberta{n.abertas === 1 ? "" : "s"}
                    {n.atrasadas ? <span className="text-status-danger"> · {n.atrasadas} atrasada{n.atrasadas === 1 ? "" : "s"}</span> : null}
                  </span>
                </span>
                <Anel valor={n.nota} tamanho={40} />
              </Link>
            </li>
          ))}
        </ul>
      </Bloco>

      <Bloco
        titulo="Hoje e amanhã"
        acao={
          <Link href="/admin/agenda" className="text-[11px] text-muted hover:text-foreground hover:underline">
            ver agenda
          </Link>
        }
      >
        {itens.length === 0 ? (
          <p className="text-sm text-muted">Nada marcado para hoje nem amanhã.</p>
        ) : (
          <div className="space-y-3">
            {[hoje, amanha].map((d) => {
              const doDia = itens.filter((i) => i.dia === d);
              if (!doDia.length) return null;
              return (
                <div key={d}>
                  <p className="eyebrow mb-1">
                    {d === hoje ? "Hoje" : "Amanhã"} · {doDia.length}
                  </p>
                  <ul>
                    {doDia.slice(0, 6).map((i) => {
                      const r = responsaveis.find((x) => x.id === i.respIds[0]);
                      return (
                        <li key={i.id} className="border-t border-border first:border-t-0">
                          <Link href={i.href} className="flex items-center gap-2.5 rounded-md py-1.5 hover:bg-[var(--hover)]" title={i.titulo}>
                            <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted">{i.hora ?? "—"}</span>
                            <Avatar nome={r?.nome ?? "?"} foto={r?.foto} tamanho={24} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium text-foreground">{i.cliente ?? "Sem cliente"}</span>
                              <span className="block truncate text-[11px] text-muted">{i.titulo}</span>
                            </span>
                            {etiqueta[i.tipo] && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${corEtiqueta[i.tipo]}`}>{etiqueta[i.tipo]}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {doDia.length > 6 && <p className="mt-1 text-[11px] text-muted">e mais {doDia.length - 6}…</p>}
                </div>
              );
            })}
          </div>
        )}
      </Bloco>
    </aside>
  );
}
