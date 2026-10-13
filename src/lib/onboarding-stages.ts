import { ONBOARDING_STAGES, type OnboardingStage } from "@/lib/onboarding-schema";

// Onboarding personalizado (out/2026): as 7 etapas e as ações continuam as do
// modelo; só as perguntas mudam por cliente e ficam salvas em
// `onboardings.questions`. Onboardings antigos (questions nulo) usam o padrão.

export type StoredStages = { stages: { id: string; questions: { id: string; text: string }[] }[] };

/** Etapas completas (nome, ícone, ações do modelo) com as perguntas salvas. */
export function stagesFromStored(stored: unknown): OnboardingStage[] {
  const lista = (stored as StoredStages | null)?.stages;
  if (!Array.isArray(lista) || lista.length === 0) return ONBOARDING_STAGES;
  return ONBOARDING_STAGES.map((base) => {
    const salva = lista.find((s) => s.id === base.id);
    const questions = (salva?.questions ?? []).filter((q) => q?.id && q?.text?.trim());
    return { ...base, questions };
  });
}

/** Só o que precisa ser guardado: id da etapa + perguntas. */
export function toStored(stages: OnboardingStage[]): StoredStages {
  return { stages: stages.map((s) => ({ id: s.id, questions: s.questions.map((q) => ({ id: q.id, text: q.text })) })) };
}

/** Monta as etapas a partir de listas de textos (uma por etapa, na ordem do modelo). */
export function stagesFromTexts(porEtapa: string[][]): OnboardingStage[] {
  return ONBOARDING_STAGES.map((base, i) => ({
    ...base,
    questions: (porEtapa[i] ?? [])
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, j) => ({ id: `${base.id}q${j + 1}`, text })),
  }));
}

/** Junta as perguntas extras do modelo (marcadas pelo admin) no fim de cada etapa. */
export function comPerguntasDoModelo(
  stages: OnboardingStage[],
  extras: { id: string; stage_id: string; texto: string }[]
): OnboardingStage[] {
  if (!extras.length) return stages;
  return stages.map((s) => {
    const textos = new Set(s.questions.map((q) => q.text.trim().toLowerCase()));
    const novas = extras
      .filter((e) => e.stage_id === s.id && !textos.has(e.texto.trim().toLowerCase()))
      .map((e) => ({ id: `${s.id}m${e.id.replace(/-/g, "").slice(0, 10)}`, text: e.texto }));
    return novas.length ? { ...s, questions: [...s.questions, ...novas] } : s;
  });
}
