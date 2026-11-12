"use client";

import { useActionState } from "react";
import { createTimeEntryAction, type CreateTimeEntryState } from "../actions";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";
import type { Client } from "@/lib/data/clients";

const initialState: CreateTimeEntryState = { error: null };

export function TimeEntryForm({ clients }: { clients: Client[] }) {
  const [state, formAction, pending] = useActionState(createTimeEntryAction, initialState);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <div>
        <label htmlFor="client_id" className="ui-label">
          Cliente
        </label>
        <select
          id="client_id"
          name="client_id"
          className="ui-input"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="activity_type" className="ui-label">
          Tipo de atividade
        </label>
        <select
          id="activity_type"
          name="activity_type"
          className="ui-input"
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
          <label htmlFor="date" className="ui-label">
            Data
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={today}
            className="ui-input"
          />
        </div>
        <div>
          <label htmlFor="hours" className="ui-label">
            Horas
          </label>
          <input
            id="hours"
            name="hours"
            type="number"
            step="0.25"
            min="0.25"
            placeholder="1,5"
            className="ui-input"
          />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="ui-label">
          Descrição
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="O que foi feito"
          className="ui-input"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground/80">
        <input type="checkbox" name="billable" defaultChecked className="rounded border-border" />
        Faturável
      </label>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Salvando..." : "Lançar horas"}
      </button>
    </form>
  );
}
