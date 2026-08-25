"use client";

import { useActionState } from "react";
import { createOwnActivityAction, type CreateActivityState } from "../actions";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";

const initialState: CreateActivityState = { error: null };

export function ActivityForm() {
  const [state, formAction, pending] = useActionState(createOwnActivityAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="type" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Tipo
        </label>
        <select
          id="type"
          name="type"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        >
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACTIVITY_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="deadline" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Prazo (opcional)
        </label>
        <input
          id="deadline"
          name="deadline"
          type="date"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Descrição (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Criar atividade"}
      </button>
    </form>
  );
}
