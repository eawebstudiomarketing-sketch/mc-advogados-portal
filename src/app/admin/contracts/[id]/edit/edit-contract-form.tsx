"use client";

import { useActionState } from "react";
import { updateContractAction, type UpdateContractState } from "../../actions";
import type { Contract } from "@/lib/data/contracts";
import { VoltarInput } from "@/components/nav/back-button";

const initialState: UpdateContractState = { error: null };

export function EditContractForm({ contract }: { contract: Contract }) {
  const [state, formAction, pending] = useActionState(updateContractAction, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <VoltarInput />
      <input type="hidden" name="id" value={contract.id} />

      <div>
        <label htmlFor="title" className="ui-label">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={contract.title}
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
            defaultValue={contract.start_date}
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
            defaultValue={contract.end_date ?? ""}
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
          defaultValue={contract.value ?? ""}
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
          defaultValue={contract.description ?? ""}
          className="ui-input"
        />
      </div>

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
