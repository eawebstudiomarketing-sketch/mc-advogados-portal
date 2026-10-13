"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { Activity } from "@/lib/data/activities";
import { ActivitiesKanban } from "./activities/activities-kanban";

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

export function QuadroInicial({ minhas, todas, rotuloTodas }: { minhas: Activity[]; todas: Activity[]; rotuloTodas: string }) {
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
        <div role="tablist" aria-label="Quais atividades" className="inline-flex items-center gap-0.5 rounded-xl bg-[#eceef2] p-1">
          {([
            ["minhas", "Minhas atividades", minhas.length],
            ["todas", rotuloTodas, todas.length],
          ] as const).map(([id, rotulo, n]) => (
            <button
              key={id}
              role="tab"
              aria-selected={aba === id}
              onClick={() => gravar(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-[background-color,color,box-shadow] duration-150 ${
                aba === id ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {rotulo}
              <span className="rounded-full bg-navy/[0.07] px-1.5 text-[11px] tabular-nums">{n}</span>
            </button>
          ))}
        </div>
        <Link href="/admin/activities/new" className="ui-link">
          <Plus className="h-3.5 w-3.5" aria-hidden /> Nova atividade
        </Link>
      </div>
      {/* key: troca de aba recomeça o quadro com a lista certa */}
      <ActivitiesKanban key={aba} activities={lista} colunas={["aberta", "em_andamento", "concluida"]} />
    </section>
  );
}
