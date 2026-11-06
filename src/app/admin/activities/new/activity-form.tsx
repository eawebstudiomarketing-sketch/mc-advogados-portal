"use client";

import { useActionState, useState } from "react";
import { createActivityAction, type CreateActivityState } from "../actions";
import { AnexosAtividade } from "@/components/atividade/anexos-atividade";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";
import type { Client } from "@/lib/data/clients";
import type { Responsavel } from "@/lib/data/responsaveis";
import { ResponsavelSelect } from "@/components/atividade/responsavel-select";
import { EnvolvidosSelect } from "@/components/atividade/envolvidos-select";
import { EtiquetasEditor } from "@/components/atividade/etiquetas";
import type { Etiqueta } from "@/lib/data/etiquetas";
import { VoltarInput } from "@/components/nav/back-button";
import { CamposAgenda } from "@/components/atividade/campos-agenda";
import { MensagemZapCampos } from "@/components/atividade/mensagem-zap-campos";

const initialState: CreateActivityState = { error: null };

export function ActivityForm({
  etiquetas = [],
  clients,
  responsaveis,
  meuResponsavel,
  clienteInicial,
  inicial = {},
  areas,
}: {
  etiquetas?: Etiqueta[];
  areas?: string[];
  clients: Client[];
  responsaveis: Responsavel[];
  meuResponsavel: string | null;
  clienteInicial?: string;
  /** Vindo de uma publicação do DJEN: título, prazo e descrição já sugeridos. */
  inicial?: { titulo?: string; descricao?: string; prazo?: string; tipo?: string; publicacao?: string; andamentos?: string; andamento?: string; categoria?: string; hora?: string; sugestao?: string };
}) {
  const [state, formAction, pending] = useActionState(createActivityAction, initialState);
  // Vindo de publicação sem processo cadastrado: obriga escolher o cliente
  // (não pré-seleciona o primeiro da lista para não salvar no cliente errado).
  const [cliente, setCliente] = useState(clienteInicial ?? "");
  const [cobrar, setCobrar] = useState(false);
  const [tipo, setTipo] = useState(inicial.tipo ?? ACTIVITY_TYPES[0]);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <VoltarInput />
      {inicial.publicacao && <input type="hidden" name="publicacao_id" value={inicial.publicacao} />}
      {inicial.sugestao && <input type="hidden" name="sugestao" value={inicial.sugestao} />}
      {inicial.andamentos && <input type="hidden" name="andamentos_processo" value={inicial.andamentos} />}
      {inicial.andamento && <input type="hidden" name="andamento_id" value={inicial.andamento} />}
      {inicial.andamentos && (
        <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-navy">
          Criando a partir de andamentos do processo. Ao salvar, os andamentos não tratados dele ficam como tratados.
        </p>
      )}
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
          required={!!inicial.publicacao}
        >
          <option value="" disabled={!!inicial.publicacao}>
            {inicial.publicacao ? "Selecione o cliente…" : "Sem cliente (tarefa interna)"}
          </option>
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
        <p className="ui-label">
          Envolvidos <span className="font-normal text-muted">· mesmos poderes do responsável (opcional)</span>
        </p>
        <EnvolvidosSelect responsaveis={responsaveis} />
      </div>

      <div>
        <p className="ui-label">Etiquetas</p>
        <EtiquetasEditor todas={etiquetas} />
      </div>

      <div>
        <label htmlFor="type" className="ui-label">
          Tipo
        </label>
        <select
          id="type"
          name="type"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
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

      {/* tipo Audiência já entra na Agenda como audiência (04/11/2026) */}
      <CamposAgenda key={tipo === "audiencia" ? "aud" : "outro"} categoria={tipo === "audiencia" ? "audiencia" : inicial.categoria} hora={inicial.hora} areas={areas} />

      {/* cobrança de documento (03/11/2026): cobra no WhatsApp do cliente até chegar */}
      <div className="rounded-xl border border-border p-3">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" name="cobrar_documentos" checked={cobrar} onChange={(e) => setCobrar(e.target.checked)} className="mt-0.5 accent-navy" />
          <span>
            <span className="block text-sm font-medium text-foreground">Depende de documento do cliente</span>
            <span className="block text-xs text-muted">O portal cobra no WhatsApp do cliente de tempos em tempos (padrão do escritório) até o documento chegar.</span>
          </span>
        </label>
        {cobrar && (
          <div className="mt-3 space-y-3 pl-6">
            {!cliente && <p className="text-xs font-medium text-status-danger">Escolha o cliente lá em cima para vincular a atividade a ele.</p>}
            <div>
              <label htmlFor="documentos_cobrar" className="ui-label">
                Documentos que faltam <span className="font-normal text-muted">· separe por vírgula</span>
              </label>
              <input id="documentos_cobrar" name="documentos_cobrar" required placeholder="RG, comprovante de residência" className="ui-input" />
            </div>
            <div>
              <label htmlFor="destino_cobranca" className="ui-label">
                Por onde vai
              </label>
              <select id="destino_cobranca" name="destino_cobranca" defaultValue="auto" className="ui-input">
                <option value="auto">Automático (grupo do cliente; sem grupo, o número)</option>
                <option value="grupo">Grupo do cliente</option>
                <option value="numero">Número do cliente</option>
              </select>
            </div>
            <p className="text-xs text-muted">O texto padrão sai sozinho. Para mudar o texto, gerar com IA ou mudar o intervalo, abra a atividade depois de criar.</p>
          </div>
        )}
      </div>

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

      {/* anexos (06/11/2026): sobem já e entram quando a atividade for criada */}
      <div>
        <p className="ui-label">
          Anexos <span className="font-normal text-muted">(opcional)</span>
        </p>
        <AnexosAtividade activityId={null} temCliente={!!cliente} />
      </div>

      <MensagemZapCampos clienteId={cliente} />

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
