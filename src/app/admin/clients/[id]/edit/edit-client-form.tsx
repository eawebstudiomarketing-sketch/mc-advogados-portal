"use client";

import { useActionState } from "react";
import { updateClientAction, type UpdateClientState } from "../../actions";
import type { Client } from "@/lib/data/clients";

const initialState: UpdateClientState = { error: null };

export function EditClientForm({ client }: { client: Client }) {
  const [state, formAction, pending] = useActionState(updateClientAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <input type="hidden" name="id" value={client.id} />

      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Nome completo / Razão social
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={client.name}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="tipo_pessoa" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Tipo de pessoa
        </label>
        <select
          id="tipo_pessoa"
          name="tipo_pessoa"
          defaultValue={client.tipo_pessoa}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        >
          <option value="PJ">Pessoa jurídica (PJ)</option>
          <option value="PF">Pessoa física (PF)</option>
        </select>
      </div>

      <div>
        <label htmlFor="documento" className="mb-1.5 block text-sm font-medium text-foreground/80">
          CPF / CNPJ
        </label>
        <input
          id="documento"
          name="documento"
          type="text"
          required
          defaultValue={client.documento}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="email_contact" className="mb-1.5 block text-sm font-medium text-foreground/80">
          E-mail de contato
        </label>
        <input
          id="email_contact"
          name="email_contact"
          type="email"
          required
          defaultValue={client.email_contact}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground/80">
        <input type="checkbox" name="active" defaultChecked={client.active} className="rounded border-border" />
        Cliente ativo
      </label>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Salvar alterações"}
      </button>
    </form>
  );
}
