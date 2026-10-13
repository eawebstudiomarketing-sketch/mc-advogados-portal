"use client";

import { useActionState } from "react";
import { updateProcessAction, type UpdateProcessState } from "../../actions";
import { PROCESS_AREA_LABEL, PROCESS_AREAS } from "@/lib/process-area";
import type { Process } from "@/lib/data/processes";
import { VoltarInput } from "@/components/nav/back-button";

const initialState: UpdateProcessState = { error: null };

export function EditProcessForm({ process }: { process: Process }) {
  const [state, formAction, pending] = useActionState(updateProcessAction, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <VoltarInput />
      <input type="hidden" name="id" value={process.id} />

      <div>
        <label htmlFor="numero_processo" className="ui-label">
          Número do processo
        </label>
        <input
          id="numero_processo"
          name="numero_processo"
          type="text"
          required
          defaultValue={process.numero_processo}
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="area" className="ui-label">
          Área
        </label>
        <select
          id="area"
          name="area"
          defaultValue={process.area}
          className="ui-input"
        >
          {PROCESS_AREAS.map((area) => (
            <option key={area} value={area}>
              {PROCESS_AREA_LABEL[area]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="vara_tribunal" className="ui-label">
          Vara / Tribunal (opcional)
        </label>
        <input
          id="vara_tribunal"
          name="vara_tribunal"
          type="text"
          defaultValue={process.vara_tribunal ?? ""}
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="fase" className="ui-label">
          Fase (opcional)
        </label>
        <input
          id="fase"
          name="fase"
          type="text"
          defaultValue={process.fase ?? ""}
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="status" className="ui-label">
          Status
        </label>
        <input
          id="status"
          name="status"
          type="text"
          defaultValue={process.status}
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
