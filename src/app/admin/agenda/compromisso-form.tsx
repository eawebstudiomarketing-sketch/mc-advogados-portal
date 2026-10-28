"use client";

import { useActionState, useState } from "react";
import { MessageCircle } from "lucide-react";
import { salvarCompromissoAction, type CompromissoState } from "./actions";

export type CompromissoInicial = {
  id?: string;
  titulo?: string;
  tipo?: string;
  dia?: string;
  hora?: string;
  horaFim?: string;
  local?: string | null;
  descricao?: string | null;
  clientId?: string | null;
  participantes?: string[];
  lembrarCliente?: boolean;
  /** veio do alerta: marca o andamento/publicação e volta para a tela de tratar */
  andamento?: string;
  publicacao?: string;
  voltar?: string;
};

const TIPOS = [
  ["reuniao", "Reunião"],
  ["audiencia", "Audiência"],
  ["ligacao", "Ligação"],
  ["evento", "Evento"],
  ["outro", "Outro"],
] as const;

export function CompromissoForm({
  inicial,
  clientes,
  pessoas,
  destinos,
  lembretesAtivos,
}: {
  inicial: CompromissoInicial;
  clientes: { id: string; name: string }[];
  pessoas: { id: string; nome: string }[];
  /** cliente → por onde sai o lembrete no WhatsApp (null = sem grupo/número) */
  destinos: Record<string, string | null>;
  lembretesAtivos: boolean;
}) {
  const [state, action, pending] = useActionState<CompromissoState, FormData>(salvarCompromissoAction, { error: null });
  const [cliente, setCliente] = useState(inicial.clientId ?? "");
  const [lembrar, setLembrar] = useState(inicial.lembrarCliente ?? true);
  const destino = cliente ? destinos[cliente] : null;

  return (
    <form action={action} className="ui-card max-w-2xl space-y-5 p-6">
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      {inicial.andamento && <input type="hidden" name="andamento_id" value={inicial.andamento} />}
      {inicial.voltar && <input type="hidden" name="return_to" value={inicial.voltar} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
        <div>
          <label htmlFor="titulo" className="ui-label">
            Título
          </label>
          <input id="titulo" name="titulo" required defaultValue={inicial.titulo} placeholder="Reunião de alinhamento mensal" className="ui-input" />
        </div>
        <div>
          <label htmlFor="tipo" className="ui-label">
            Tipo
          </label>
          <select id="tipo" name="tipo" defaultValue={inicial.tipo ?? "reuniao"} className="ui-input">
            {TIPOS.map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="dia" className="ui-label">
            Dia
          </label>
          <input id="dia" name="dia" type="date" required defaultValue={inicial.dia} className="ui-input" />
        </div>
        <div>
          <label htmlFor="hora" className="ui-label">
            Início
          </label>
          <input id="hora" name="hora" type="time" required defaultValue={inicial.hora} className="ui-input" />
        </div>
        <div>
          <label htmlFor="hora_fim" className="ui-label">
            Término <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input id="hora_fim" name="hora_fim" type="time" defaultValue={inicial.horaFim} className="ui-input" />
        </div>
      </div>

      <div>
        <label htmlFor="client_id" className="ui-label">
          Cliente <span className="font-normal text-muted">(opcional)</span>
        </label>
        <select id="client_id" name="client_id" value={cliente} onChange={(e) => setCliente(e.target.value)} className="ui-input">
          <option value="">Sem cliente (compromisso interno)</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {cliente && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="lembrar_cliente" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--navy)]" />
            <span>
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <MessageCircle className="h-4 w-4 text-zap-ink" aria-hidden /> Lembrar o cliente pelo WhatsApp 24h e 1h antes
              </span>
              <span className="block text-xs text-muted">
                {!lembretesAtivos
                  ? "Os lembretes estão desligados em Equipe → Pessoas, áreas e WhatsApp."
                  : destino
                    ? `Sai no ${destino}, com o texto padrão do escritório.`
                    : "Este cliente não tem grupo nem número do WhatsApp cadastrado na ficha: o lembrete não vai sair."}
              </span>
            </span>
          </label>
        </div>
      )}

      <fieldset>
        <legend className="ui-label">Quem participa da equipe</legend>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {pessoas.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
              <input type="checkbox" name="participantes" value={p.id} defaultChecked={inicial.participantes?.includes(p.id)} className="h-4 w-4 accent-[var(--navy)]" />
              {p.nome}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Aparece na agenda e na rotina das 8h de cada participante.</p>
      </fieldset>

      <div>
        <label htmlFor="local" className="ui-label">
          Local ou link <span className="font-normal text-muted">(opcional)</span>
        </label>
        <input id="local" name="local" defaultValue={inicial.local ?? ""} placeholder="Google Meet, escritório, endereço…" className="ui-input" />
      </div>

      <div>
        <label htmlFor="descricao" className="ui-label">
          Observações <span className="font-normal text-muted">(opcional)</span>
        </label>
        <textarea id="descricao" name="descricao" rows={3} defaultValue={inicial.descricao ?? ""} className="ui-input" />
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="ui-btn w-full py-2.5">
        {pending ? "Salvando..." : inicial.id ? "Salvar alterações" : "Criar compromisso"}
      </button>
    </form>
  );
}
