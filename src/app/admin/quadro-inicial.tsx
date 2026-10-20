"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { Activity } from "@/lib/data/activities";
import { ActivitiesKanban } from "./activities/activities-kanban";
import type { Etiqueta } from "@/lib/data/etiquetas";

// Quadro da Visão geral: abre nas atividades da pessoa ("Minhas") e tem a aba
// com todas as dos clientes dela (para o admin, todas do escritório). A aba
// escolhida fica lembrada na sessão.

type Aba = "minhas" | "todas";
const CHAVE = "mc:inicio:aba";
const ouvintes = new Set<() => void>();
function ler(): Aba {
  try {
    return sessionStorage.getItem(CHAVE) === "todas" ? "todas" : "minhas";
  } catch {
    return "minhas";
  }
}
function gravar(a: Aba) {
  try {
    sessionStorage.setItem(CHAVE, a);
  } catch {}
  ouvintes.forEach((f) => f());
}

export function QuadroInicial({
  minhas,
  todas,
  rotuloTodas,
  etiquetas = [],
}: {
  minhas: Activity[];
  todas: Activity[];
  rotuloTodas: string;
  etiquetas?: Etiqueta[];
}) {
  const aba = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    ler,
    () => "minhas" as Aba
  );
  const lista = aba === "minhas" ? minhas : todas;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Quais atividades" className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-1">
          {([
            ["minhas", "Minhas atividades", minhas.length],
            ["todas", rotuloTodas, todas.length],
          ] as const).map(([id, rotulo, n]) => (
            <button
              key={id}
              role="tab"
              aria-selected={aba === id}
              onClick={() => gravar(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-[background-color,color] duration-150 ${
                aba === id ? "bg-navy text-white" : "text-muted hover:text-foreground"
              }`}
            >
              {rotulo}
              <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${aba === id ? "bg-white/15" : "bg-navy/[0.07]"}`}>{n}</span>
            </button>
          ))}
        </div>
        <Link href="/admin/activities/new" className="ui-link">
          <Plus className="h-3.5 w-3.5" aria-hidden /> Nova atividade
        </Link>
      </div>
      {/* key: troca de aba recomeça o quadro com a lista certa */}
      <ActivitiesKanban key={aba} etiquetas={etiquetas} activities={lista} colunas={["aberta", "em_andamento", "concluida"]} />
    </section>
  );
}
