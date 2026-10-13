"use client";

import { useActionState } from "react";
import { createOwnTimeEntryAction, type CreateTimeEntryState } from "../actions";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";

const initialState: CreateTimeEntryState = { error: null };

export function TimeEntryForm() {
  const [state, formAction, pending] = useActionState(createOwnTimeEntryAction, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
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
