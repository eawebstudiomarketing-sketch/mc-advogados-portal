"use client";

import { useActionState } from "react";
import { createFinancialRecordAction, type CreateFinancialRecordState } from "../actions";
import type { Client } from "@/lib/data/clients";

const initialState: CreateFinancialRecordState = { error: null };

export function FinancialRecordForm({ clients }: { clients: Client[] }) {
  const [state, formAction, pending] = useActionState(createFinancialRecordAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div>
        <label htmlFor="client_id" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Cliente
        </label>
        <select
          id="client_id"
          name="client_id"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Descrição
        </label>
        <input
          id="description"
          name="description"
          type="text"
          required
          placeholder="Mensalidade — agosto/2026"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Valor
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="1800,00"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
        </div>
        <div>
          <label htmlFor="due_date" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Vencimento
          </label>
          <input
            id="due_date"
            name="due_date"
            type="date"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Criar lançamento"}
      </button>
    </form>
  );
}
