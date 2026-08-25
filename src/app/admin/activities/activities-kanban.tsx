"use client";

import { useState } from "react";
import type { DragEvent } from "react";
import type { Activity } from "@/lib/data/activities";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_STATUSES, type ActivityStatus } from "@/lib/activity-status";
import { updateActivityStatusAction } from "./actions";
import { formatDate } from "@/lib/mock-data";

const COLUMN_ACCENT: Record<ActivityStatus, string> = {
  aberta: "border-t-status-pending",
  em_andamento: "border-t-status-info",
  concluida: "border-t-status-success",
  cancelada: "border-t-status-danger",
};

export function ActivitiesKanban({ activities }: { activities: Activity[] }) {
  const [items, setItems] = useState(activities);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ActivityStatus | null>(null);

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
    <div className="grid grid-cols-1 gap-4 overflow-x-auto pb-2 sm:grid-cols-2 lg:grid-cols-4">
      {ACTIVITY_STATUSES.map((status) => {
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
            className={`flex min-h-[200px] flex-col gap-2 rounded-xl border border-t-4 bg-surface p-3 shadow-sm ${COLUMN_ACCENT[status]} ${
              dragOverStatus === status ? "border-navy bg-background" : "border-border"
            }`}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy">{ACTIVITY_STATUS_LABEL[status]}</h3>
              <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-foreground/50">
                {columnItems.length}
              </span>
            </div>

            {columnItems.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-foreground/40">
                Nenhuma atividade
              </p>
            )}

            {columnItems.map((a) => (
              <div
                key={a.id}
                draggable
                onDragStart={() => setDragId(a.id)}
                onDragEnd={() => setDragId(null)}
                className={`cursor-grab rounded-lg border border-border bg-background p-3 shadow-sm active:cursor-grabbing ${
                  dragId === a.id ? "opacity-40" : ""
                }`}
              >
                <p className="text-sm font-medium text-foreground">{a.title}</p>
                <p className="mt-1 text-xs text-foreground/50">{a.clients?.name}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-foreground/40">
                  <span>{ACTIVITY_TYPE_LABEL[a.type]}</span>
                  {a.deadline && <span>{formatDate(a.deadline)}</span>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
