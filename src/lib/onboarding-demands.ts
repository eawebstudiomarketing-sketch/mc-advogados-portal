import { ONBOARDING_STAGES, type OnboardingAnswers, type OnboardingStage } from "@/lib/onboarding-schema";
import type { ActivityType } from "@/lib/activity-type";

// Tipos das demandas proativas e o texto do onboarding que vai para a IA.
// A geração em si é feita pelo Gemini (src/lib/demands-ai.ts) desde out/2026;
// antes era pelo Claude a partir de um único onboarding.

export type DemandPriority = "alta" | "media" | "baixa";

export type GeneratedDemand = {
  title: string;
  priority: DemandPriority;
  activity_type: ActivityType;
  action: string;
  reason: string;
  next_step: string;
};

export function buildOnboardingText(
  clientName: string,
  answers: OnboardingAnswers,
  stages: OnboardingStage[] = ONBOARDING_STAGES
): string {
  const blocks: string[] = [`Cliente: ${clientName}`];
  for (const stage of stages) {
    const answered = stage.questions.filter((q) => answers[q.id]?.trim());
    if (answered.length === 0) continue;
    blocks.push(
      `\n## ${stage.number}. ${stage.name}\n` +
        answered.map((q) => `P: ${q.text}\nR: ${answers[q.id].trim()}`).join("\n\n")
    );
  }
  return blocks.join("\n");
}

export function hasAnyAnswer(answers: OnboardingAnswers): boolean {
  return Object.values(answers).some((v) => v?.trim());
}
