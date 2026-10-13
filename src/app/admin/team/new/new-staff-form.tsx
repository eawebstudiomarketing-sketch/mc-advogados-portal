"use client";

import { useActionState } from "react";
import { inviteStaffAction, type InviteUserState } from "../actions";
import { VoltarInput } from "@/components/nav/back-button";

const initialState: InviteUserState = { error: null };

export function NewStaffForm() {
  const [state, formAction, pending] = useActionState(inviteStaffAction, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <VoltarInput />
      <div>
        <label htmlFor="full_name" className="ui-label">
          Nome completo
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="email" className="ui-label">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="role" className="ui-label">
          Papel
        </label>
        <select
          id="role"
          name="role"
          defaultValue="advogado"
          className="ui-input"
        >
          <option value="advogado">Advogado(a)</option>
          <option value="admin">Administrador</option>
        </select>
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Enviando convite..." : "Enviar convite"}
      </button>

      <p className="text-xs text-muted">
        A pessoa recebe um e-mail do Supabase com um link pra definir a própria senha e acessar o painel.
      </p>
    </form>
  );
}
