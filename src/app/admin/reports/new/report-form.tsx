"use client";

import { useActionState } from "react";
import { generateReportAction, type GenerateReportState } from "../actions";
import type { Client } from "@/lib/data/clients";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const initialState: GenerateReportState = { error: null };

export function ReportForm({ clients }: { clients: Client[] }) {
  const [state, formAction, pending] = useActionState(generateReportAction, initialState);
  const now = new Date();

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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="reference_month" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Mês de referência
          </label>
          <select
            id="reference_month"
            name="reference_month"
            defaultValue={now.getMonth() + 1}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          >
            {MESES.slice(1).map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reference_year" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Ano
          </label>
          <input
            id="reference_year"
            name="reference_year"
            type="number"
            defaultValue={now.getFullYear()}
            min="2020"
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
        {pending ? "Gerando..." : "Gerar relatório"}
      </button>

      <p className="text-xs text-foreground/40">
        Gera um PDF com horas, atividades e lançamentos financeiros do cliente no mês selecionado. Se já existir um relatório pra esse período, ele é substituído.
      </p>
    </form>
  );
}
