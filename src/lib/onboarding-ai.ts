import "server-only";
import { generateJson, type GeminiResult } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { ONBOARDING_STAGES, type OnboardingStage } from "@/lib/onboarding-schema";
import { stagesFromTexts } from "@/lib/onboarding-stages";

// Gera as perguntas do onboarding para UM cliente a partir da triagem. As 7
// etapas e suas ações são as do modelo do escritório; o Gemini só escreve as
// perguntas de cada etapa sob medida para o negócio e o nicho do cliente.

const SYSTEM = `Você prepara o roteiro de onboarding de um escritório de advocacia empresarial (MC Advogados, Teixeira de Freitas-BA) para um cliente específico. Recebe a Ficha de Handoff do cliente (o que o comercial apurou na venda: identificação, motivo da contratação, dores, objetivos, urgências, perfil e observações) e as 7 etapas fixas do onboarding, cada uma com seu objetivo e as perguntas do modelo padrão como referência.

Para cada etapa, escreva as perguntas que o advogado vai fazer na reunião de onboarding com ESTE cliente:
- Adapte ao ramo, nicho, porte e situação descritos na ficha. Ex.: para um restaurante, pergunte de vigilância sanitária, alvarás, delivery e escala de funcionários; para uma construtora, de obras, subempreitada, segurança do trabalho e contratos com clientes.
- Não pergunte o que a ficha já responde com clareza; aprofunde o que ela deixa em aberto, as dores marcadas, as urgências e as objeções levantadas na venda.
- Cubra o objetivo da etapa. Use as perguntas do modelo como base do que não pode faltar, reescritas para o caso.
- 4 a 7 perguntas por etapa, claras, uma ideia por pergunta, em português do Brasil, tom profissional e acolhedor (o cliente responde em voz alta).
- Não invente fatos sobre o cliente nem cite valores ou nomes que não estejam na ficha.`;

const SCHEMA = {
  type: "object",
  properties: {
    etapas: {
      type: "array",
      minItems: ONBOARDING_STAGES.length,
      maxItems: ONBOARDING_STAGES.length,
      items: {
        type: "object",
        properties: {
          numero: { type: "integer" },
          perguntas: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
        },
        required: ["numero", "perguntas"],
      },
    },
  },
  required: ["etapas"],
};

function descreverEtapas(): string {
  return ONBOARDING_STAGES.map(
    (s) =>
      `Etapa ${s.number} — ${s.name}\nAções do escritório nesta etapa: ${s.actions.join(" ")}\nPerguntas do modelo padrão:\n${s.questions.map((q) => `- ${q.text}`).join("\n")}`
  ).join("\n\n");
}

export async function generateOnboardingStages(cliente: {
  name: string;
  tipo_pessoa: string;
  triagem: string;
}): Promise<GeminiResult<OnboardingStage[]>> {
  const result = await generateJson<{ etapas: { numero: number; perguntas: string[] }[] }>({
    model: MODELOS.onboarding,
    system: SYSTEM,
    schema: SCHEMA,
    parts: [
      {
        text:
          `Cliente: ${cliente.name} (${cliente.tipo_pessoa === "PF" ? "pessoa física" : "pessoa jurídica"})\n\n` +
          `FICHA DE HANDOFF:\n${cliente.triagem}\n\n` +
          `ETAPAS DO ONBOARDING:\n\n${descreverEtapas()}\n\n` +
          `Devolva as perguntas das ${ONBOARDING_STAGES.length} etapas, na ordem, com "numero" = número da etapa.`,
      },
    ],
  });
  if (!result.ok) return result;

  const porEtapa = ONBOARDING_STAGES.map((s) => result.data.etapas?.find((e) => e.numero === s.number)?.perguntas ?? []);
  if (porEtapa.some((p) => p.length === 0)) {
    return { ok: false, error: "O Gemini deixou etapas sem perguntas. Tente gerar de novo." };
  }
  return { ok: true, data: stagesFromTexts(porEtapa) };
}
