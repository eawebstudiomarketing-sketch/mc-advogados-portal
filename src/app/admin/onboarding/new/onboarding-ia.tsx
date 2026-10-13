"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { generateOnboardingQuestionsAction } from "../actions";
import { OnboardingForm } from "./onboarding-form";
import { AiProgress } from "@/components/ui/ai-progress";
import type { Client } from "@/lib/data/clients";
import type { OnboardingStage } from "@/lib/onboarding-schema";
import { comPerguntasDoModelo } from "@/lib/onboarding-stages";

// Onboarding personalizado: ao abrir, pede ao Gemini as perguntas para este
// cliente (lê a ficha de handoff) e depois mostra o formulário normal com elas.
export function OnboardingIa({ client, extras }: { client: Client; extras: { id: string; stage_id: string; texto: string }[] }) {
  const [stages, setStages] = useState<OnboardingStage[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [geracao, setGeracao] = useState(0);
  const pedido = useRef(0);

  const pedir = useCallback(() => {
    const meu = ++pedido.current;
    generateOnboardingQuestionsAction(client.id)
      .then((r) => {
        if (meu !== pedido.current) return;
        if (r.ok) {
          setStages(comPerguntasDoModelo(r.stages, extras));
          setGeracao((g) => g + 1);
        } else setErro(r.error);
      })
      .catch(() => meu === pedido.current && setErro("Não foi possível gerar as perguntas. Tente novamente."));
  }, [client.id, extras]);

  function gerar() {
    setStages(null);
    setErro(null);
    pedir();
  }

  useEffect(() => {
    pedir();
  }, [pedir]);

  if (erro) {
    return (
      <div className="max-w-xl ui-card p-6">
        <p className="text-sm text-status-danger">{erro}</p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs font-medium">
          <button type="button" onClick={gerar} className="text-navy hover:underline">
            Tentar de novo
          </button>
          <Link href={`/admin/clients/${client.id}/handoff`} className="text-navy hover:underline">
            Preencher a ficha de handoff
          </Link>
          <Link href={`/admin/onboarding/new?clientId=${client.id}&modo=padrao`} className="text-muted hover:underline">
            Usar as perguntas padrão
          </Link>
        </div>
      </div>
    );
  }

  if (!stages) {
    return (
      <AiProgress
        titulo={`O Gemini está montando o onboarding de ${client.name}`}
        etapas={["Lendo a ficha de handoff", "Entendendo o negócio e o nicho", "Escrevendo as perguntas das 7 etapas", "Revisando e organizando"]}
      />
    );
  }

  return (
    <OnboardingForm
      key={geracao}
      clients={[client]}
      preselectedClientId={client.id}
      stages={stages}
      personalizado
      onRegenerar={gerar}
    />
  );
}
