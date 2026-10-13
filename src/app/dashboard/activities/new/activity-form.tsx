"use client";

import { useActionState } from "react";
import { createOwnActivityAction, type CreateActivityState } from "../actions";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";
import { VoltarInput } from "@/components/nav/back-button";

const initialState: CreateActivityState = { error: null };

export function ActivityForm() {
  const [state, formAction, pending] = useActionState(createOwnActivityAction, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <VoltarInput />
      <div>
        <label htmlFor="title" className="ui-label">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="type" className="ui-label">
          Tipo
        </label>
        <select
          id="type"
          name="type"
          className="ui-input"
        >
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACTIVITY_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="deadline" className="ui-label">
          Prazo (opcional)
        </label>
        <input
          id="deadline"
          name="deadline"
          type="date"
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="description" className="ui-label">
          Descrição (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          className="ui-input"
        />
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Salvando..." : "Criar atividade"}
      </button>
    </form>
  );
}
