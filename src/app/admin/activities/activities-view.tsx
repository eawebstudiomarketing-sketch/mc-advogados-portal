"use client";

import { useState } from "react";
import Link from "next/link";
import type { Activity } from "@/lib/data/activities";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { StatusSelect } from "./status-select";
import { deleteActivityAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatDate } from "@/lib/mock-data";
import { ActivitiesKanban } from "./activities-kanban";

export function ActivitiesView({ activities }: { activities: Activity[] }) {
  const [mode, setMode] = useState<"list" | "kanban">("list");

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-surface p-1 w-fit">
        <button
          onClick={() => setMode("list")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "list" ? "bg-navy text-navy-foreground" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          Lista
        </button>
        <button
          onClick={() => setMode("kanban")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === "kanban" ? "bg-navy text-navy-foreground" : "text-foreground/60 hover:text-foreground"
          }`}
        >
          Kanban
        </button>
      </div>

      {mode === "kanban" ? (
        <ActivitiesKanban activities={activities} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
                <th className="px-5 py-3 font-medium">Atividade</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Responsável</th>
                <th className="px-5 py-3 font-medium">Prazo</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activities.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-foreground/50">
                    Nenhuma atividade registrada ainda.
                  </td>
                </tr>
              )}
              {activities.map((a) => (
                <tr key={a.id} className="hover:bg-background">
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{a.title}</p>
                    <p className="text-xs text-foreground/50">{ACTIVITY_TYPE_LABEL[a.type]}</p>
                  </td>
                  <td className="px-5 py-3 text-foreground/70">{a.clients?.name}</td>
                  <td className="px-5 py-3 text-foreground/70">{a.profiles?.full_name}</td>
                  <td className="px-5 py-3 text-foreground/70">{a.deadline ? formatDate(a.deadline) : "—"}</td>
                  <td className="px-5 py-3">
                    <StatusSelect id={a.id} status={a.status} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/admin/activities/${a.id}/edit`} className="text-xs font-medium text-navy hover:underline">
                        Editar
                      </Link>
                      <ConfirmSubmitButton
                        action={deleteActivityAction}
                        hiddenFields={{ id: a.id }}
                        confirmMessage={`Excluir a atividade "${a.title}"?`}
                        label="Excluir"
                        className="text-xs font-medium text-status-danger hover:underline"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
