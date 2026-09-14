"use client";

import { useActionState, useRef } from "react";
import { saveOnboardingAction, type SaveOnboardingState } from "../actions";
import {
  ONBOARDING_STAGES,
  ONBOARDING_OBJECTIVE,
  ONBOARDING_INFO_ESSENCIAIS,
  ONBOARDING_CHECKLIST_CONCLUSAO,
  ONBOARDING_REGRA_OURO,
} from "@/lib/onboarding-schema";
import type { Client } from "@/lib/data/clients";

const initialState: SaveOnboardingState = { error: null };

export function OnboardingForm({
  clients,
  preselectedClientId,
}: {
  clients: Client[];
  preselectedClientId?: string;
}) {
  const [state, formAction, pending] = useActionState(saveOnboardingAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const preselected = preselectedClientId ? clients.find((c) => c.id === preselectedClientId) : undefined;

  function handleLimpar() {
    if (!confirm("Tem certeza que deseja limpar todas as respostas?")) return;
    formRef.current?.querySelectorAll<HTMLTextAreaElement>("textarea[data-onboarding-answer]").forEach((el) => {
      el.value = "";
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <label htmlFor="client_id" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Cliente
        </label>
        {preselected ? (
          <>
            <input type="hidden" name="client_id" value={preselected.id} />
            <p className="text-sm font-medium text-foreground">{preselected.name}</p>
          </>
        ) : (
          <select
            id="client_id"
            name="client_id"
            className="w-full max-w-sm rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex gap-3 rounded-xl border-l-4 border-gold bg-surface p-5 shadow-sm">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy text-lg">🎯</div>
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy">Objetivo</h2>
          <p className="text-sm text-foreground/60">{ONBOARDING_OBJECTIVE}</p>
        </div>
      </div>

      {ONBOARDING_STAGES.map((stage) => (
        <div key={stage.id} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <div className="flex items-center gap-2 bg-navy px-4 py-2.5 text-sm font-semibold uppercase text-navy-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-xs text-navy">
              {stage.number}
            </span>
            <span>
              {stage.icon} {stage.name}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy">Perguntas principais</h3>
              <div className="space-y-4">
                {stage.questions.map((q) => (
                  <div key={q.id}>
                    <label htmlFor={q.id} className="mb-1 block text-sm font-medium text-foreground">
                      {q.text}
                    </label>
                    <textarea
                      id={q.id}
                      name={q.id}
                      data-onboarding-answer
                      rows={2}
                      className="w-full rounded-lg border-l-2 border-gold bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-navy">Ações a serem realizadas</h3>
              <ul className="space-y-2">
                {stage.actions.map((action, i) => (
                  <li key={i} className="flex gap-2 border-b border-border pb-2 text-sm text-foreground/60 last:border-0">
                    <span className="font-bold text-gold">•</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold">💡 Informações essenciais</h3>
          <ul className="space-y-1.5">
            {ONBOARDING_INFO_ESSENCIAIS.map((item, i) => (
              <li key={i} className="text-sm text-foreground/60">
                ○ {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold">✅ Checklist de conclusão</h3>
          <ul className="space-y-1.5">
            {ONBOARDING_CHECKLIST_CONCLUSAO.map((item, i) => (
              <li key={i} className="text-sm text-foreground/60">
                ○ {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border-2 border-gold bg-surface p-6 text-center shadow-sm">
        <p className="mb-2 text-2xl">👑</p>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold">Regra de Ouro MC</h3>
        <p className="text-sm text-foreground/60">{ONBOARDING_REGRA_OURO.text}</p>
        <p className="mt-1 text-sm font-bold text-navy">{ONBOARDING_REGRA_OURO.destaque}</p>
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <div className="flex flex-wrap justify-center gap-3 pb-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy px-6 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
        >
          {pending ? "Salvando..." : "Salvar onboarding (gera PDF)"}
        </button>
        <button
          type="button"
          onClick={handleLimpar}
          className="rounded-lg border border-gold px-6 py-2.5 text-sm font-medium text-navy hover:bg-gold/10"
        >
          Limpar respostas
        </button>
      </div>
    </form>
  );
}
