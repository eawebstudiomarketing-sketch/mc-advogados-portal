"use client";

import { CamposWhatsapp } from "@/components/cliente/campos-whatsapp";
import { CamposPF, EnderecoCampos } from "@/components/cliente/campos-pf";
import { useActionState, useState } from "react";
import { updateClientAction, type UpdateClientState } from "../../actions";
import type { Client } from "@/lib/data/clients";
import { VoltarInput } from "@/components/nav/back-button";

const initialState: UpdateClientState = { error: null };

export function EditClientForm({ client }: { client: Client }) {
  const [state, formAction, pending] = useActionState(updateClientAction, initialState);
  const [tipo, setTipo] = useState<"PF" | "PJ">(client.tipo_pessoa);
  const pf = tipo === "PF";

  return (
    <form action={formAction} className="max-w-2xl space-y-5 ui-card p-6">
      <VoltarInput />
      <input type="hidden" name="id" value={client.id} />

      <div>
        <label htmlFor="tipo_pessoa" className="ui-label">
          Tipo de cliente
        </label>
        <select id="tipo_pessoa" name="tipo_pessoa" value={tipo} onChange={(e) => setTipo(e.target.value as "PF" | "PJ")} className="ui-input">
          <option value="PJ">Empresa (pessoa jurídica)</option>
          <option value="PF">Pessoa física</option>
        </select>
      </div>

      <div>
        <label htmlFor="name" className="ui-label">
          {pf ? "Nome completo" : "Razão social"}
        </label>
        <input id="name" name="name" type="text" required defaultValue={client.name} className="ui-input" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="documento" className="ui-label">
            {pf ? "CPF" : "CNPJ"} {pf && <span className="font-normal text-muted">(opcional)</span>}
          </label>
          <input id="documento" name="documento" type="text" required={!pf} defaultValue={client.documento ?? ""} className="ui-input" />
        </div>
        <div>
          <label htmlFor="email_contact" className="ui-label">
            E-mail {pf && <span className="font-normal text-muted">(opcional)</span>}
          </label>
          <input id="email_contact" name="email_contact" type="email" required={!pf} defaultValue={client.email_contact ?? ""} className="ui-input" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground/80">
        <input type="checkbox" name="active" defaultChecked={client.active} className="rounded border-border" />
        Cliente ativo
      </label>

      {pf ? <CamposPF c={client} /> : <EnderecoCampos c={client} />}

      <CamposWhatsapp grupos={client.whatsapp_grupos} numeros={client.whatsapp_numeros} />

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button type="submit" disabled={pending} className="ui-btn w-full py-2.5">
        {pending ? "Salvando..." : "Salvar alterações"}
      </button>
    </form>
  );
}
