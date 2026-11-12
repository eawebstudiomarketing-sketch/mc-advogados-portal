"use client";

import { SeletorCliente } from "@/components/ui/seletor-cliente";
import { useActionState } from "react";
import { createFinancialRecordAction, type CreateFinancialRecordState } from "../actions";
import type { Client } from "@/lib/data/clients";
import { VoltarInput } from "@/components/nav/back-button";

const initialState: CreateFinancialRecordState = { error: null };

export function FinancialRecordForm({ clients, clientId }: { clients: Client[]; clientId?: string }) {
  const [state, formAction, pending] = useActionState(createFinancialRecordAction, initialState);

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
        <label htmlFor="description" className="ui-label">
          Descrição
        </label>
        <input
          id="description"
          name="description"
          type="text"
          required
          placeholder="Mensalidade — agosto/2026"
          className="ui-input"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="amount" className="ui-label">
            Valor
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="1800,00"
            className="ui-input"
          />
        </div>
        <div>
          <label htmlFor="due_date" className="ui-label">
            Vencimento
          </label>
          <input
            id="due_date"
            name="due_date"
            type="date"
            className="ui-input"
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Salvando..." : "Criar lançamento"}
      </button>
    </form>
  );
}
