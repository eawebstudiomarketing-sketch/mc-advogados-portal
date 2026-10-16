"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";

// Demandas de cada um (visão do admin): por pessoa, separadas por prazo,
// com filtro por pessoa, prazo, cliente e texto.

export type ItemDemanda = { id: string; titulo: string; cliente: string | null; prazo: string | null; status: string; area: string | null };
export type CargaSerial = {
  id: string;
  nome: string;
  areas: string[];
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Pessoa" className="ui-input w-auto py-1.5 text-sm">
          <option value="">Todas as pessoas</option>
          {cargas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({c.total})
            </option>
          ))}
        </select>
        <select value={prazo} onChange={(e) => setPrazo(e.target.value)} aria-label="Prazo" className="ui-input w-auto py-1.5 text-sm">
          <option value="">Qualquer prazo</option>
          <option value="atrasadas">Atrasadas</option>
          <option value="hoje">Hoje</option>
          <option value="semana">Próximos 7 dias</option>
          <option value="depois">Mais adiante</option>
          <option value="sem_prazo">Sem prazo</option>
        </select>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por atividade ou cliente" aria-label="Buscar" className="ui-input py-1.5 pl-8 text-sm" />
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
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy/[0.07] text-xs font-semibold text-navy-3">
                  {c.nome.replace(/^(Dr\.?|Dra\.?)\s+/i, "").slice(0, 2).toUpperCase()}
                </span>
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
