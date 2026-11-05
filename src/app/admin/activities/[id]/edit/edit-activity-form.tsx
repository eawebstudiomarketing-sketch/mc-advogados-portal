"use client";

import { useActionState } from "react";
import { CamposAgenda } from "@/components/atividade/campos-agenda";
import { updateActivityAction, type UpdateActivityState } from "../../actions";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";
import type { Activity } from "@/lib/data/activities";
import type { Responsavel } from "@/lib/data/responsaveis";
import { ResponsavelSelect } from "@/components/atividade/responsavel-select";
import { EnvolvidosSelect } from "@/components/atividade/envolvidos-select";
import { EtiquetasEditor } from "@/components/atividade/etiquetas";
import type { Etiqueta } from "@/lib/data/etiquetas";
import { VoltarInput } from "@/components/nav/back-button";
import { CampoPrazo, type PedidoAberto } from "@/components/atividade/campo-prazo";

const initialState: UpdateActivityState = { error: null };

export function EditActivityForm({ etiquetas = [], activity, responsaveis, areas, podeMudarPrazo, pedidoPrazo }: {
  etiquetas?: Etiqueta[]; activity: Activity; responsaveis: Responsavel[]; areas?: string[]; podeMudarPrazo: boolean; pedidoPrazo: PedidoAberto }) {
  const [state, formAction, pending] = useActionState(updateActivityAction, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <input type="hidden" name="id" value={activity.id} />
      <VoltarInput />

      <div>
        <label htmlFor="title" className="ui-label">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={activity.title}
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="responsavel_id" className="ui-label">
          Responsável <span className="font-normal text-muted">· recebe os avisos de prazo por e-mail</span>
        </label>
        <ResponsavelSelect responsaveis={responsaveis} defaultValue={activity.responsavel_id} clientId={activity.client_id} />
      </div>

      <div>
        <p className="ui-label">
          Envolvidos <span className="font-normal text-muted">· mesmos poderes do responsável</span>
        </p>
        <EnvolvidosSelect responsaveis={responsaveis} defaultValue={activity.envolvidos ?? []} />
      </div>

      <div>
        <p className="ui-label">Etiquetas</p>
        <EtiquetasEditor todas={etiquetas} defaultValue={activity.etiquetas ?? []} />
      </div>

      <div>
        <label htmlFor="type" className="ui-label">
          Tipo
        </label>
        <select
          id="type"
          name="type"
          defaultValue={activity.type}
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
        <CampoPrazo activityId={activity.id} deadline={activity.deadline} podeMudar={podeMudarPrazo} pedido={pedidoPrazo} />
      </div>

      <CamposAgenda categoria={activity.categoria} hora={activity.hora} areas={areas} area={activity.area} />

      <div>
        <label htmlFor="description" className="ui-label">
          Descrição (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={activity.description ?? ""}
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
