"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LinhaAtividade } from "@/lib/painel/base";
import { usePainel } from "./contexto";

// Painel do Dono — foco em GENTE (24/10/2026): primeiro quem é o responsável
// (com foto) e qual o cliente; a atividade e o prazo vêm em segundo plano,
// e o detalhe abre no clique.

const iniciais = (n: string) =>
  n
    .replace(/^(Dra?\.)\s+/i, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

export function Avatar({ nome, foto, tamanho = 36 }: { nome: string; foto?: string | null; tamanho?: number }) {
  const estilo = { width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.36) };
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={foto} alt="" style={estilo} className="shrink-0 rounded-full object-cover ring-2 ring-surface" />
  ) : (
    <span style={estilo} className="flex shrink-0 items-center justify-center rounded-full bg-navy font-semibold text-white ring-2 ring-surface" aria-hidden>
      {iniciais(nome) || "?"}
    </span>
  );
}

/** Uma linha: cliente em destaque, atividade em segundo plano, prazo à direita. */
function LinhaCliente({ a, direita, tom }: { a: LinhaAtividade; direita: string; tom?: string }) {
  const { clientes } = usePainel();
  const cli = a.clienteId ? clientes.get(a.clienteId) : null;
  return (
    <li className="border-t border-border first:border-t-0">
      <Link href={`/admin/activities/${a.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1 py-2 hover:bg-[var(--hover)]" title={a.titulo}>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{cli?.nome ?? "Sem cliente"}</span>
          <span className="block truncate text-xs text-muted">{a.titulo}</span>
        </span>
        <span className={`shrink-0 text-xs font-medium tabular-nums ${tom ?? "text-muted"}`}>{direita}</span>
      </Link>
    </li>
  );
}

/**
 * Atividades agrupadas por responsável: foto + nome + contagem no topo,
 * depois os clientes. Quem tem mais itens aparece primeiro.
 */
export function PorResponsavel({
  itens,
  direita,
  rotuloContagem,
  porPessoa = 3,
  vazio,
}: {
  itens: LinhaAtividade[];
  direita: (a: LinhaAtividade) => { texto: string; tom?: string };
  /** ex.: (n) => `${n} atrasadas` */
  rotuloContagem: (n: number) => string;
  porPessoa?: number;
  vazio: string;
}) {
  const { responsaveis } = usePainel();
  const [abertos, setAbertos] = useState<string[]>([]);
  if (!itens.length) return <p className="text-sm text-muted">{vazio}</p>;
  const grupos = new Map<string, LinhaAtividade[]>();
  for (const a of itens) grupos.set(a.respId ?? "-", [...(grupos.get(a.respId ?? "-") ?? []), a]);
  const lista = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <div className="space-y-4">
      {lista.map(([rid, xs]) => {
        const r = responsaveis.find((x) => x.id === rid);
        const nome = r?.nome ?? "Sem responsável";
        const aberto = abertos.includes(rid);
        const mostrar = aberto ? xs : xs.slice(0, porPessoa);
        return (
          <div key={rid} className="rounded-xl border border-border p-3">
            <div className="mb-1 flex items-center gap-3">
              <Avatar nome={nome} foto={r?.foto} />
              <div className="min-w-0 flex-1">
                {r ? (
                  <Link href={`/admin/painel?aba=responsaveis&pessoa=${r.id}`} className="block truncate text-sm font-semibold text-foreground hover:underline">
                    {nome}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold text-foreground">{nome}</p>
                )}
                <p className="text-xs text-muted">
                  {new Set(xs.map((a) => a.clienteId)).size} cliente(s)
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground">{rotuloContagem(xs.length)}</span>
            </div>
            <ul>
              {mostrar.map((a) => {
                const d = direita(a);
                return <LinhaCliente key={a.id} a={a} direita={d.texto} tom={d.tom} />;
              })}
            </ul>
            {xs.length > porPessoa && (
              <button type="button" onClick={() => setAbertos((v) => (aberto ? v.filter((x) => x !== rid) : [...v, rid]))} className="mt-1 inline-flex items-center gap-1 px-1 text-xs text-muted hover:text-foreground">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden />
                {aberto ? "mostrar menos" : `ver todas (${xs.length})`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Linha de agenda com foco na pessoa: foto + quem, cliente, e a atividade embaixo. */
export function LinhaAgenda({ a, etiqueta }: { a: LinhaAtividade; etiqueta?: React.ReactNode }) {
  const { clientes, responsaveis } = usePainel();
  const r = responsaveis.find((x) => x.id === a.respId);
  const cli = a.clienteId ? clientes.get(a.clienteId) : null;
  return (
    <li className="border-t border-border first:border-t-0">
      <Link href={`/admin/activities/${a.id}`} className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-[var(--hover)]" title={a.titulo}>
        <span className="w-11 shrink-0 text-xs tabular-nums text-muted">{a.hora ?? "—"}</span>
        <Avatar nome={r?.nome ?? "?"} foto={r?.foto} tamanho={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">
            <b className="font-semibold">{r?.nome ?? "Sem responsável"}</b>
            <span className="text-muted"> · </span>
            {cli?.nome ?? "Sem cliente"}
          </span>
          <span className="block truncate text-xs text-muted">{a.titulo}</span>
        </span>
        {etiqueta}
      </Link>
    </li>
  );
}

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const diasDesde = (d: string, hoje: string) => Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86_400_000);

/** Tudo em aberto, por responsável (ficha do número "Abertas"). */
export function AbertasPorPessoa() {
  const { atividades } = usePainel();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
  const itens = atividades.filter((a) => a.status === "aberta" || a.status === "em_andamento").sort((x, y) => (x.prazo ?? "9999").localeCompare(y.prazo ?? "9999"));
  return (
    <PorResponsavel
      itens={itens}
      vazio="Nada em aberto."
      rotuloContagem={(n) => `${n} aberta${n > 1 ? "s" : ""}`}
      direita={(a) => (a.prazo ? { texto: `vence ${dm(a.prazo)}`, tom: a.prazo < hoje ? "text-status-danger" : undefined } : { texto: "sem prazo" })}
    />
  );
}

/** Atrasadas por responsável (ficha do número "Atrasadas"). */
export function AtrasadasPorPessoa() {
  const { atividades } = usePainel();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
  const itens = atividades.filter((a) => (a.status === "aberta" || a.status === "em_andamento") && a.prazo && a.prazo < hoje).sort((x, y) => x.prazo!.localeCompare(y.prazo!));
  return (
    <PorResponsavel
      itens={itens}
      vazio="Nada atrasado. 👏"
      porPessoa={10}
      rotuloContagem={(n) => `${n} atrasada${n > 1 ? "s" : ""}`}
      direita={(a) => ({ texto: `venceu ${dm(a.prazo!)} · ${diasDesde(a.prazo!, hoje)} d`, tom: "text-status-danger" })}
    />
  );
}
