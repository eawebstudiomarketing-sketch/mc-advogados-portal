"use client";

import { useActionState } from "react";
import { createProcessAction, type CreateProcessState } from "../actions";
import { PROCESS_AREA_LABEL, PROCESS_AREAS } from "@/lib/process-area";
import type { Client } from "@/lib/data/clients";
import { VoltarInput } from "@/components/nav/back-button";

const initialState: CreateProcessState = { error: null };

export function ProcessForm({
  clients,
  numeroInicial,
  clienteInicial,
  varaInicial,
  areaInicial,
  exigirCliente = false,
}: {
  clients: Client[];
  numeroInicial?: string;
  /** Vindo de uma publicação: cliente achado pelas partes, vara e área sugeridas. */
  clienteInicial?: string;
  varaInicial?: string;
  areaInicial?: string;
  /** Veio de publicação e nenhum cliente bateu: obriga escolher (sem pré-seleção). */
  exigirCliente?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createProcessAction, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <VoltarInput />
      <div>
        <label htmlFor="client_id" className="ui-label">
          Cliente
        </label>
        <select
          id="client_id"
          name="client_id"
          defaultValue={clienteInicial ?? (exigirCliente ? "" : undefined)}
          required
          className="ui-input"
        >
          {exigirCliente && !clienteInicial && (
            <option value="" disabled>
              Selecione o cliente…
            </option>
          )}
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="numero_processo" className="ui-label">
          Número do processo
        </label>
        <input
          id="numero_processo"
          name="numero_processo"
          type="text"
          required
          defaultValue={numeroInicial}
          placeholder="0000000-00.0000.0.00.0000"
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
          defaultValue={areaInicial}
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
          defaultValue={varaInicial}
          type="text"
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
          className="ui-input"
        />
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Salvando..." : "Cadastrar processo"}
      </button>
    </form>
  );
}
