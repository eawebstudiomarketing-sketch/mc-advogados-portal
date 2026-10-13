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
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <div>
        <label htmlFor="client_id" className="ui-label">
          Cliente
        </label>
        <select
          id="client_id"
          name="client_id"
          className="ui-input"
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
          <label htmlFor="reference_month" className="ui-label">
            Mês de referência
          </label>
          <select
            id="reference_month"
            name="reference_month"
            defaultValue={now.getMonth() + 1}
            className="ui-input"
          >
            {MESES.slice(1).map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reference_year" className="ui-label">
            Ano
          </label>
          <input
            id="reference_year"
            name="reference_year"
            type="number"
            defaultValue={now.getFullYear()}
            min="2020"
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
        {pending ? "Gerando..." : "Gerar relatório"}
      </button>

      <p className="text-xs text-muted">
        Gera um PDF com as atividades do cliente: concluídas no mês selecionado, em andamento e a fazer. Se já existir um relatório pra esse período, ele é substituído.
      </p>
    </form>
  );
}
