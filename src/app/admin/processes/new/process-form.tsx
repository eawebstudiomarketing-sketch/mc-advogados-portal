"use client";

import { useActionState } from "react";
import { createProcessAction, type CreateProcessState } from "../actions";
import { PROCESS_AREA_LABEL, PROCESS_AREAS } from "@/lib/process-area";
import type { Client } from "@/lib/data/clients";

const initialState: CreateProcessState = { error: null };

export function ProcessForm({ clients }: { clients: Client[] }) {
  const [state, formAction, pending] = useActionState(createProcessAction, initialState);

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
        <label htmlFor="numero_processo" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Número do processo
        </label>
        <input
          id="numero_processo"
          name="numero_processo"
          type="text"
          required
          placeholder="0000000-00.0000.0.00.0000"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="area" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Área
        </label>
        <select
          id="area"
          name="area"
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
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Cadastrar processo"}
      </button>
    </form>
  );
}
