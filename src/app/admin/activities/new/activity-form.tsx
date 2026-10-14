"use client";

import { useActionState, useState } from "react";
import { createActivityAction, type CreateActivityState } from "../actions";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";
import type { Client } from "@/lib/data/clients";
import type { Responsavel } from "@/lib/data/responsaveis";
import { ResponsavelSelect } from "@/components/atividade/responsavel-select";
import { VoltarInput } from "@/components/nav/back-button";
import { CamposAgenda } from "@/components/atividade/campos-agenda";

const initialState: CreateActivityState = { error: null };

export function ActivityForm({
  clients,
  responsaveis,
  meuResponsavel,
  clienteInicial,
  inicial = {},
}: {
  clients: Client[];
  responsaveis: Responsavel[];
  meuResponsavel: string | null;
  clienteInicial?: string;
  /** Vindo de uma publicação do DJEN: título, prazo e descrição já sugeridos. */
  inicial?: { titulo?: string; descricao?: string; prazo?: string; tipo?: string; publicacao?: string; categoria?: string; hora?: string; sugestao?: string };
}) {
  const [state, formAction, pending] = useActionState(createActivityAction, initialState);
  // Vindo de publicação sem processo cadastrado: obriga escolher o cliente
  // (não pré-seleciona o primeiro da lista para não salvar no cliente errado).
  const [cliente, setCliente] = useState(clienteInicial ?? (inicial.publicacao ? "" : clients[0]?.id ?? ""));

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <VoltarInput />
      {inicial.publicacao && <input type="hidden" name="publicacao_id" value={inicial.publicacao} />}
      {inicial.sugestao && <input type="hidden" name="sugestao" value={inicial.sugestao} />}
      {inicial.publicacao && (
        <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-navy">
          Criando a partir de uma publicação (diário oficial ou INPI). Confira a data sugerida: ao salvar, a publicação fica como tratada.
        </p>
      )}
      <div>
        <label htmlFor="client_id" className="ui-label">
          Cliente
        </label>
        <select
          id="client_id"
          name="client_id"
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          className="ui-input"
          required
        >
          {cliente === "" && (
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
        <label htmlFor="title" className="ui-label">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={inicial.titulo}
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="responsavel_id" className="ui-label">
          Responsável <span className="font-normal text-muted">· recebe os avisos de prazo por e-mail</span>
        </label>
        <ResponsavelSelect key={cliente} responsaveis={responsaveis} defaultValue={meuResponsavel} clientId={cliente} />
      </div>

      <div>
        <label htmlFor="type" className="ui-label">
          Tipo
        </label>
        <select
          id="type"
          name="type"
          defaultValue={inicial.tipo}
          className="ui-input"
        >
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ACTIVITY_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="deadline" className="ui-label">
          Prazo (opcional)
        </label>
        <input
          id="deadline"
          name="deadline"
          type="date"
          defaultValue={inicial.prazo}
          className="ui-input"
        />
      </div>

      <CamposAgenda categoria={inicial.categoria} hora={inicial.hora} />

      <div>
        <label htmlFor="description" className="ui-label">
          Descrição (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={inicial.descricao ? 8 : 3}
          defaultValue={inicial.descricao}
          className="ui-input"
        />
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Salvando..." : "Criar atividade"}
      </button>
    </form>
  );
}
