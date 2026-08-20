"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createClientAction, type CreateClientState } from "../actions";

const initialState: CreateClientState = { error: null };

export default function NewClientPage() {
  const [state, formAction, pending] = useActionState(createClientAction, initialState);

  return (
    <div>
      <Link href="/admin/clients" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para clientes
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Novo cliente</h1>

      <form action={formAction} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Nome completo / Razão social
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
        </div>

        <div>
          <label htmlFor="tipo_pessoa" className="mb-1.5 block text-sm font-medium text-foreground/80">
            Tipo de pessoa
          </label>
          <select
            id="tipo_pessoa"
            name="tipo_pessoa"
            defaultValue="PJ"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          >
            <option value="PJ">Pessoa jurídica (PJ)</option>
            <option value="PF">Pessoa física (PF)</option>
          </select>
        </div>

        <div>
          <label htmlFor="documento" className="mb-1.5 block text-sm font-medium text-foreground/80">
            CPF / CNPJ
          </label>
          <input
            id="documento"
            name="documento"
            type="text"
            required
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
        </div>

        <div>
          <label htmlFor="email_contact" className="mb-1.5 block text-sm font-medium text-foreground/80">
            E-mail de contato
          </label>
          <input
            id="email_contact"
            name="email_contact"
            type="email"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          />
        </div>

        {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Cadastrar cliente"}
        </button>
      </form>
    </div>
  );
}
