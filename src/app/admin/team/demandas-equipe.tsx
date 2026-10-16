"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

// Demandas de cada um (visão do admin): por pessoa, separadas por prazo,
// com filtro por pessoa, prazo, cliente e texto.

export type ItemDemanda = { id: string; titulo: string; cliente: string | null; prazo: string | null; status: string; area: string | null };
export type CargaSerial = {
  id: string;
  nome: string;
  areas: string[];
  foto: string | null;
  grupos: { chave: string; rotulo: string; itens: ItemDemanda[] }[];
  total: number;
};

const COR: Record<string, string> = {
  atrasadas: "text-status-danger",
  hoje: "text-status-pending",
  semana: "text-status-info",
  depois: "text-foreground/70",
  sem_prazo: "text-muted",
};
const dataBR = (s: string) => s.split("-").reverse().slice(0, 2).join("/");

export function DemandasEquipe({ cargas, semResponsavel }: { cargas: CargaSerial[]; semResponsavel: ItemDemanda[] }) {
  const [pessoa, setPessoa] = useState("");
  const [prazo, setPrazo] = useState("");
  const [busca, setBusca] = useState("");
  const [fechados, setFechados] = useState<Set<string>>(new Set());

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const casa = (i: ItemDemanda) => !t || i.titulo.toLowerCase().includes(t) || (i.cliente ?? "").toLowerCase().includes(t);
    return cargas
      .filter((c) => !pessoa || c.id === pessoa)
      .map((c) => {
        const grupos = c.grupos.filter((g) => !prazo || g.chave === prazo).map((g) => ({ ...g, itens: g.itens.filter(casa) }));
        return { ...c, grupos, total: grupos.reduce((s, g) => s + g.itens.length, 0) };
      });
  }, [cargas, pessoa, prazo, busca]);

  return (
    <div>
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPessoa("")}
            className={`inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${!pessoa ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/75 hover:border-border-strong"}`}
          >
            Todas as pessoas
          </button>
          {cargas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setPessoa(pessoa === c.id ? "" : c.id)}
              className={`inline-flex h-9 items-center gap-2 rounded-full border py-0 pr-3.5 pl-1 text-[13px] font-medium ${
                pessoa === c.id ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/75 hover:border-border-strong"
              }`}
            >
              <Avatar nome={c.nome} foto={c.foto} tamanho={28} />
              {c.nome.replace(/^(Dr\.?|Dra\.?)\s+/i, "").split(" ")[0]}
              <span className="numero-grande text-sm">{c.total}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["", "Qualquer prazo", ""],
            ["atrasadas", "Atrasadas", "bg-status-danger"],
            ["hoje", "Hoje", "bg-status-pending"],
            ["semana", "Próximos 7 dias", "bg-status-info"],
            ["depois", "Mais adiante", "bg-status-success"],
            ["sem_prazo", "Sem prazo", "bg-border-strong"],
          ].map(([v, r, cor]) => (
            <button
              key={v || "todos"}
              type="button"
              onClick={() => setPrazo(v)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${prazo === v ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/75 hover:border-border-strong"}`}
            >
              {cor && <span className={`h-1.5 w-1.5 rounded-full ${cor}`} aria-hidden />}
              {r}
            </button>
          ))}
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar atividade ou cliente"
              aria-label="Buscar"
              className="h-9 w-full rounded-full border border-border bg-surface pr-3 pl-10 text-[13px] hover:border-border-strong focus:border-navy-3 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {filtradas.map((c) => {
          const aberto = !fechados.has(c.id);
          const atrasadas = c.grupos.find((g) => g.chave === "atrasadas")?.itens.length ?? 0;
          return (
            <section key={c.id} className="ui-card overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setFechados((f) => {
                    const n = new Set(f);
                    if (n.has(c.id)) n.delete(c.id);
                    else n.add(c.id);
                    return n;
                  })
                }
                aria-expanded={aberto}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60"
              >
                <Avatar nome={c.nome} foto={c.foto} tamanho={40} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{c.nome}</p>
                  <p className="truncate text-xs text-muted">{c.areas.length ? c.areas.join(" · ") : "Sem área definida"}</p>
                </div>
                <span className="text-sm text-foreground tabular-nums">
                  {c.total} <span className="text-xs text-muted">em aberto</span>
                </span>
                {atrasadas > 0 && <span className="rounded-full bg-status-danger-bg px-2 py-0.5 text-xs font-medium text-status-danger">{atrasadas} atrasada(s)</span>}
                <ChevronDown className={`h-4 w-4 text-muted transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {aberto && (
                <div className="border-t border-border px-4 py-3">
                  {c.total === 0 ? (
                    <p className="text-sm text-muted">Nada em aberto{busca || prazo ? " com esse filtro" : ""}.</p>
                  ) : (
                    c.grupos
                      .filter((g) => g.itens.length)
                      .map((g) => (
                        <div key={g.chave} className="mb-3 last:mb-0">
                          <p className={`mb-1 text-[11px] font-semibold tracking-wide uppercase ${COR[g.chave]}`}>
                            {g.rotulo} · {g.itens.length}
                          </p>
                          <ul className="space-y-0.5">
                            {g.itens.map((i) => (
                              <li key={i.id}>
                                <Link href={`/admin/activities/${i.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
                                  <span className="min-w-0 flex-1 truncate text-foreground">{i.titulo}</span>
                                  {i.cliente && <span className="hidden max-w-40 truncate text-xs text-muted sm:inline">{i.cliente}</span>}
                                  {i.prazo && <span className="text-xs text-muted tabular-nums">{dataBR(i.prazo)}</span>}
                                  {i.status === "em_andamento" && <span className="rounded bg-status-info-bg px-1.5 text-[10px] text-status-info">andamento</span>}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {semResponsavel.length > 0 && !pessoa && (
        <section className="ui-card mt-4 p-4">
          <p className="text-sm font-medium text-foreground">Sem responsável · {semResponsavel.length}</p>
          <ul className="mt-2 space-y-0.5">
            {semResponsavel.map((i) => (
              <li key={i.id}>
                <Link href={`/admin/activities/${i.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate">{i.titulo}</span>
                  {i.cliente && <span className="text-xs text-muted">{i.cliente}</span>}
                  {i.prazo && <span className="text-xs text-muted tabular-nums">{dataBR(i.prazo)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
