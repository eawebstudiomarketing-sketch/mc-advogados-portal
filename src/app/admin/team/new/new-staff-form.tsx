"use client";

import { useActionState } from "react";
import { inviteStaffAction, type InviteUserState } from "../actions";

const initialState: InviteUserState = { error: null };

export function NewStaffForm() {
  const [state, formAction, pending] = useActionState(inviteStaffAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div>
        <label htmlFor="full_name" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Nome completo
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground/80">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Papel
        </label>
        <select
          id="role"
          name="role"
          defaultValue="advogado"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        >
          <option value="advogado">Advogado(a)</option>
          <option value="admin">Administrador</option>
        </select>
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
      >
        {pending ? "Enviando convite..." : "Enviar convite"}
      </button>

      <p className="text-xs text-foreground/40">
        A pessoa recebe um e-mail do Supabase com um link pra definir a própria senha e acessar o painel.
      </p>
    </form>
  );
}
