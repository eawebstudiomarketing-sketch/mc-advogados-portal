"use client";

import { useActionState } from "react";
import { updateContractAction, type UpdateContractState } from "../../actions";
import type { Contract } from "@/lib/data/contracts";

const initialState: UpdateContractState = { error: null };

export function EditContractForm({ contract }: { contract: Contract }) {
  const [state, formAction, pending] = useActionState(updateContractAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <input type="hidden" name="id" value={contract.id} />

      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={contract.title}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="start_date" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Início
          </label>
          <input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={contract.start_date}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
        </div>
        <div>
          <label htmlFor="end_date" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Fim (opcional)
          </label>
          <input
            id="end_date"
            name="end_date"
            type="date"
            defaultValue={contract.end_date ?? ""}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
        </div>
      </div>

      <div>
        <label htmlFor="value" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Valor (opcional)
        </label>
        <input
          id="value"
          name="value"
          type="number"
          step="0.01"
          min="0.01"
          defaultValue={contract.value ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Descrição (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={contract.description ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

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
