"use client";

import { CamposWhatsapp } from "@/components/cliente/campos-whatsapp";
import { useActionState } from "react";
import { createClientAction, type CreateClientState } from "../actions";

const initialState: CreateClientState = { error: null };

export function NewClientForm() {
  const [state, formAction, pending] = useActionState(createClientAction, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <div>
        <label htmlFor="name" className="ui-label">
          Nome completo / Razão social
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
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
          defaultValue="PJ"
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
          placeholder="000.000.000-00 ou 00.000.000/0000-00"
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
          className="ui-input"
        />
      </div>

      <CamposWhatsapp />

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Salvando..." : "Cadastrar cliente"}
      </button>
    </form>
  );
}
