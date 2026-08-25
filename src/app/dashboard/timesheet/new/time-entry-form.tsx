"use client";

import { useActionState } from "react";
import { createOwnTimeEntryAction, type CreateTimeEntryState } from "../actions";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";

const initialState: CreateTimeEntryState = { error: null };

export function TimeEntryForm() {
  const [state, formAction, pending] = useActionState(createOwnTimeEntryAction, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div>
        <label htmlFor="activity_type" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Tipo de atividade
        </label>
        <select
          id="activity_type"
          name="activity_type"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        >
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACTIVITY_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Data
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={today}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
        </div>
        <div>
          <label htmlFor="hours" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Horas
          </label>
          <input
            id="hours"
            name="hours"
            type="number"
            step="0.25"
            min="0.25"
            placeholder="1,5"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Descrição
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="O que foi feito"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Lançar horas"}
      </button>
    </form>
  );
}
