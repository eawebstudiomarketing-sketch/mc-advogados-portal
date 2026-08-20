"use client";

import { useActionState } from "react";
import { updateProcessAction, type UpdateProcessState } from "../../actions";
import { PROCESS_AREA_LABEL, PROCESS_AREAS } from "@/lib/process-area";
import type { Process } from "@/lib/data/processes";

const initialState: UpdateProcessState = { error: null };

export function EditProcessForm({ process }: { process: Process }) {
  const [state, formAction, pending] = useActionState(updateProcessAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <input type="hidden" name="id" value={process.id} />

      <div>
        <label htmlFor="numero_processo" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Número do processo
        </label>
        <input
          id="numero_processo"
          name="numero_processo"
          type="text"
          required
          defaultValue={process.numero_processo}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="area" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Área
        </label>
        <select
          id="area"
          name="area"
          defaultValue={process.area}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        >
          {PROCESS_AREAS.map((area) => (
            <option key={area} value={area}>
              {PROCESS_AREA_LABEL[area]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="vara_tribunal" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Vara / Tribunal (opcional)
        </label>
        <input
          id="vara_tribunal"
          name="vara_tribunal"
          type="text"
          defaultValue={process.vara_tribunal ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="fase" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Fase (opcional)
        </label>
        <input
          id="fase"
          name="fase"
          type="text"
          defaultValue={process.fase ?? ""}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Status
        </label>
        <input
          id="status"
          name="status"
          type="text"
          defaultValue={process.status}
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
