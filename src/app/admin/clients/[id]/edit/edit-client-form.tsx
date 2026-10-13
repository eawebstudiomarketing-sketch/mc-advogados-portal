"use client";

import { useActionState } from "react";
import { updateClientAction, type UpdateClientState } from "../../actions";
import type { Client } from "@/lib/data/clients";
import { VoltarInput } from "@/components/nav/back-button";

const initialState: UpdateClientState = { error: null };

export function EditClientForm({ client }: { client: Client }) {
  const [state, formAction, pending] = useActionState(updateClientAction, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <VoltarInput />
      <input type="hidden" name="id" value={client.id} />

      <div>
        <label htmlFor="name" className="ui-label">
          Nome completo / Razão social
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={client.name}
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="tipo_pessoa" className="ui-label">
          Tipo de pessoa
        </label>
        <select
          id="tipo_pessoa"
          name="tipo_pessoa"
          defaultValue={client.tipo_pessoa}
          className="ui-input"
        >
          <option value="PJ">Pessoa jurídica (PJ)</option>
          <option value="PF">Pessoa física (PF)</option>
        </select>
      </div>

      <div>
        <label htmlFor="documento" className="ui-label">
          CPF / CNPJ
        </label>
        <input
          id="documento"
          name="documento"
          type="text"
          required
          defaultValue={client.documento}
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="email_contact" className="ui-label">
          E-mail de contato
        </label>
        <input
          id="email_contact"
          name="email_contact"
          type="email"
          required
          defaultValue={client.email_contact}
          className="ui-input"
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
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Salvando..." : "Salvar alterações"}
      </button>
    </form>
  );
}
