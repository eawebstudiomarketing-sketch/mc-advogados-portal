"use client";

import { CamposWhatsapp } from "@/components/cliente/campos-whatsapp";
import { CamposPF } from "@/components/cliente/campos-pf";
import { useActionState, useState } from "react";
import { createClientAction, type CreateClientState } from "../actions";

const initialState: CreateClientState = { error: null };

export function NewClientForm({ tipoInicial = "PJ", podePF = true }: { tipoInicial?: "PF" | "PJ"; podePF?: boolean }) {
  const [state, formAction, pending] = useActionState(createClientAction, initialState);
  const [tipo, setTipo] = useState<"PF" | "PJ">(podePF ? tipoInicial : "PJ");
  const pf = tipo === "PF";

  return (
    <form action={formAction} className="max-w-2xl space-y-5 ui-card p-6">
      <div>
        <label htmlFor="tipo_pessoa" className="ui-label">
          Tipo de cliente
        </label>
        <select id="tipo_pessoa" name="tipo_pessoa" value={tipo} onChange={(e) => setTipo(e.target.value as "PF" | "PJ")} className="ui-input">
          <option value="PJ">Empresa (pessoa jurídica)</option>
          {podePF && <option value="PF">Pessoa física</option>}
        </select>
      </div>

      <div>
        <label htmlFor="name" className="ui-label">
          {pf ? "Nome completo" : "Razão social"}
        </label>
        <input id="name" name="name" type="text" required className="ui-input" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="documento" className="ui-label">
            {pf ? "CPF" : "CNPJ"} {pf && <span className="font-normal text-muted">(opcional)</span>}
          </label>
          <input id="documento" name="documento" type="text" required={!pf} placeholder={pf ? "000.000.000-00" : "00.000.000/0000-00"} className="ui-input" />
        </div>
        <div>
          <label htmlFor="email_contact" className="ui-label">
            E-mail {pf && <span className="font-normal text-muted">(opcional)</span>}
          </label>
          <input id="email_contact" name="email_contact" type="email" required={!pf} className="ui-input" />
        </div>
      </div>

      {pf && <CamposPF />}

      <CamposWhatsapp />

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button type="submit" disabled={pending} className="ui-btn w-full py-2.5">
        {pending ? "Salvando..." : pf ? "Cadastrar pessoa" : "Cadastrar empresa"}
      </button>
    </form>
  );
}
