import "server-only";
import type { Part } from "@google/genai";
import { generateJson, type GeminiResult } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import type { DemandPriority, GeneratedDemand } from "@/lib/onboarding-demands";

// Demandas proativas a partir das fontes que o advogado escolhe na ficha do
// cliente (triagem, onboarding, ATAs, documento avulso) + instrução opcional.
// O Gemini devolve RASCUNHOS; nada vira atividade sem aprovação.

const PRIORITIES: DemandPriority[] = ["alta", "media", "baixa"];

const SYSTEM = `Você é assistente de um escritório de advocacia empresarial (MC Advogados). Recebe material de UM cliente (triagem, respostas de onboarding, atas de reunião e/ou documentos) e propõe demandas que o escritório deve abrir para esse cliente.

Regras:
- Baseie-se SOMENTE no material recebido. Não invente fatos, valores, prazos, processos ou obrigações. Se algo estiver vago, a demanda deve ser levantar/confirmar a informação.
- Se houver uma instrução do advogado, ela define o foco: siga-a.
- Cada demanda é uma tarefa interna do escritório (para revisão do advogado), não um compromisso assumido com o cliente.
- Não repita demandas que já constam na lista de atividades em aberto do cliente.
- Gere de 8 a 12 demandas, sem repetir tema. Cubra frentes diferentes que o material sustenta (ex.: trabalhista, tributário, contratos, societário, marca, LGPD, consumidor, regulatório). Nada de itens genéricos: cada demanda precisa estar ligada a algo concreto do material; quando faltar informação, a demanda é levantar/confirmar esse ponto.
- Prioridade: "alta" para risco imediato, prazo provável ou o que motivou a contratação (notificações, processos, dívidas que pressionam o caixa, prazos citados em ata); "media" para o que precisa de análise sem urgência declarada; "baixa" para organização e melhorias.
- "action": a ação sugerida, concreta e curta. "reason": por que a demanda existe, citando de onde veio (ex.: "na ata de 12/09 o cliente relatou..."). "next_step": o primeiro passo prático.
- "activity_type": consultoria, processo, contrato, reuniao ou pesquisa.
- Português do Brasil com acentuação e ortografia corretas em todos os campos (ex.: "Análise", "Reunião", "Notificação"), tom profissional e direto.`;

const SCHEMA = {
  type: "object",
  properties: {
    demands: {
      type: "array",
      minItems: 8,
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          priority: { type: "string", enum: PRIORITIES },
          activity_type: { type: "string", enum: ACTIVITY_TYPES },
          action: { type: "string" },
          reason: { type: "string" },
          next_step: { type: "string" },
        },
        required: ["title", "priority", "activity_type", "action", "reason", "next_step"],
      },
    },
  },
  required: ["demands"],
};

export async function generateDemandsFromSources({
  clientName,
  material,
  instructions,
  openActivities,
}: {
  clientName: string;
  material: Part[];
  instructions: string;
  openActivities: string[];
}): Promise<GeminiResult<GeneratedDemand[]>> {
  const parts: Part[] = [
    { text: `Cliente: ${clientName}\n\nMATERIAL DO CLIENTE:` },
    ...material,
    {
      text:
        `\n\nATIVIDADES JÁ EM ABERTO (não repetir):\n${openActivities.length ? openActivities.map((t) => `- ${t}`).join("\n") : "(nenhuma)"}` +
        (instructions ? `\n\nINSTRUÇÃO DO ADVOGADO (foco desta geração):\n${instructions}` : "") +
        `\n\nProponha as demandas.`,
    },
  ];

  const result = await generateJson<{ demands?: GeneratedDemand[] }>({ model: MODELOS.demandas, system: SYSTEM, schema: SCHEMA, parts });
  if (!result.ok) return result;

  const demands = (result.data.demands ?? []).filter(
    (d) => d.title?.trim() && PRIORITIES.includes(d.priority) && ACTIVITY_TYPES.includes(d.activity_type)
  );
  if (demands.length === 0) return { ok: false, error: "O Gemini não encontrou demandas no material escolhido." };
  return { ok: true, data: demands };
}
