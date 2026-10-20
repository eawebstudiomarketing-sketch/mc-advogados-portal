"use client";

import { EtiquetasLinha } from "@/components/atividade/etiquetas";
import type { Etiqueta } from "@/lib/data/etiquetas";
import { Avatar } from "@/components/ui/avatar";
import { useState } from "react";
import type { DragEvent } from "react";
import { AtividadeLink, useAbrirAtividade } from "@/components/atividade/atividade-modal";
import { nomeResponsavel } from "@/lib/responsavel-nome";
import type { Activity } from "@/lib/data/activities";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_STATUSES, type ActivityStatus } from "@/lib/activity-status";
import { updateActivityStatusAction } from "./actions";
import { formatDate } from "@/lib/mock-data";

const COLUMN_DOT: Record<ActivityStatus, string> = {
  aberta: "bg-status-pending",
  em_andamento: "bg-status-info",
  concluida: "bg-status-success",
  cancelada: "bg-border-strong",
};

const hojeBahia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** Prazo com cor de urgência: atrasada (vermelho), hoje/amanhã (amarelo). */
function PrazoCartao({ deadline, status }: { deadline: string; status: ActivityStatus }) {
  const d = Math.round((Date.parse(deadline) - Date.parse(hojeBahia())) / 86_400_000);
  const aberta = status === "aberta" || status === "em_andamento";
  const tom = !aberta ? "text-muted" : d < 0 ? "font-medium text-status-danger" : d <= 1 ? "font-medium text-status-pending" : "text-muted";
  const texto = !aberta ? formatDate(deadline) : d < 0 ? `atrasada ${-d}d` : d === 0 ? "hoje" : d === 1 ? "amanhã" : formatDate(deadline);
  return <span className={`tabular-nums ${tom}`}>{texto}</span>;
}

export function ActivitiesKanban({
  activities,
  colunas = ACTIVITY_STATUSES,
  etiquetas = [],
}: {
  etiquetas?: Etiqueta[];
  activities: Activity[];
  /** quais colunas mostrar (padrão: todos os status) */
  colunas?: readonly ActivityStatus[];
}) {
  const [items, setItems] = useState(activities);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ActivityStatus | null>(null);
  const abrir = useAbrirAtividade();

  // a lista de fora mudou (edição na mini tela, filtro): acompanha
  const [origem, setOrigem] = useState(activities);
  if (origem !== activities) {
    setOrigem(activities);
    setItems(activities);
  }

  const moveTo = async (id: string, status: ActivityStatus) => {
    const current = items.find((a) => a.id === id);
    if (!current || current.status === status) return;

    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));

    const formData = new FormData();
    formData.set("id", id);
    formData.set("status", status);
    await updateActivityStatusAction(formData);
  };

  return (
    <div className={`grid grid-cols-1 gap-4 overflow-x-auto pb-2 sm:grid-cols-2 ${colunas.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
      {colunas.map((status) => {
        const columnItems = items.filter((a) => a.status === status);
        return (
          <div
            key={status}
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setDragOverStatus(status);
            }}
            onDragLeave={() => setDragOverStatus((s) => (s === status ? null : s))}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragOverStatus(null);
              if (dragId) moveTo(dragId, status);
            }}
            className={`flex min-h-[240px] flex-col gap-2 rounded-2xl border p-2.5 transition-colors duration-150 ${
              dragOverStatus === status ? "border-navy-3/40 bg-navy/[0.04]" : "border-border bg-surface-2"
            }`}
          >
            <div className="mb-1 flex items-center justify-between px-1.5 pt-1">
              <h3 className="eyebrow flex items-center gap-2 !text-foreground/80">
                <span className={`h-1.5 w-1.5 rounded-full ${COLUMN_DOT[status]}`} aria-hidden />
                {ACTIVITY_STATUS_LABEL[status]}
              </h3>
              <span className="numero-grande text-sm text-muted">
                {columnItems.length}
              </span>
            </div>

            {columnItems.length === 0 && (
              <p className="rounded-xl border border-dashed border-border-strong p-5 text-center text-xs text-muted">
                Nenhuma atividade
              </p>
            )}

            {columnItems.map((a) => (
              <div
                key={a.id}
                draggable
                onDragStart={() => setDragId(a.id)}
                onDragEnd={() => setDragId(null)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) return;
                  abrir(a.id);
                }}
                className={`cursor-pointer rounded-xl border border-border bg-surface p-3.5 transition-[border-color,transform,opacity] duration-150 hover:-translate-y-px hover:border-border-strong active:cursor-grabbing ${
                  dragId === a.id ? "rotate-1 opacity-40" : ""
                }`}
              >
                <AtividadeLink id={a.id} className="text-sm font-medium text-foreground underline-offset-2 hover:underline">
                  {a.title}
                </AtividadeLink>
                <p className="mt-1 text-xs text-muted">{a.clients?.name}</p>
                {(a.etiquetas ?? []).length > 0 && (
                  <div className="mt-2">
                    <EtiquetasLinha ids={a.etiquetas ?? []} todas={etiquetas} />
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
                  {nomeResponsavel(a) ? (
                    <Avatar nome={nomeResponsavel(a)!} foto={a.responsaveis?.foto_url} tamanho={24} />
                  ) : (
                    <span className="eyebrow">{ACTIVITY_TYPE_LABEL[a.type]}</span>
                  )}
                  {a.deadline && <PrazoCartao deadline={a.deadline} status={a.status} />}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
