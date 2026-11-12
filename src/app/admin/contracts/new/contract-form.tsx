"use client";

import { SeletorCliente } from "@/components/ui/seletor-cliente";
import { useActionState } from "react";
import { createContractAction, type CreateContractState } from "../actions";
import type { Client } from "@/lib/data/clients";
import { VoltarInput } from "@/components/nav/back-button";

const initialState: CreateContractState = { error: null };

export function ContractForm({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const [state, formAction, pending] = useActionState(createContractAction, initialState);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <VoltarInput />
      <div>
        <label htmlFor="client_id" className="ui-label">
          Cliente
        </label>
        <SeletorCliente id="client_id" clients={clients} inicial={clientId} />
      </div>

      <div>
        <label htmlFor="title" className="ui-label">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="Assessoria Jurídica Mensal"
          className="ui-input"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="start_date" className="ui-label">
            Início
          </label>
          <input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={today}
            className="ui-input"
          />
        </div>
        <div>
          <label htmlFor="end_date" className="ui-label">
            Fim (opcional)
          </label>
          <input
            id="end_date"
            name="end_date"
            type="date"
            className="ui-input"
          />
        </div>
      </div>

      <div>
        <label htmlFor="value" className="ui-label">
          Valor (opcional)
        </label>
        <input
          id="value"
          name="value"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="1800,00"
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
        {pending ? "Salvando..." : "Criar contrato"}
      </button>
    </form>
  );
}
