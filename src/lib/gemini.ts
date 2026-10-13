import "server-only";
import { GoogleGenAI, ApiError, type Part } from "@google/genai";

// Cliente único do Gemini (Google AI Studio, nível pago). Toda geração do
// portal pede resposta em JSON com formato fixo e devolve erro em português.

export const GEMINI_MODEL = "gemini-3.1-flash-lite"; // padrão barato; cada tarefa escolhe o seu em ia-modelos.ts

export type GeminiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function generateJson<T>({
  system,
  parts,
  schema,
  model = GEMINI_MODEL,
}: {
  system: string;
  parts: Part[];
  schema: Record<string, unknown>;
  model?: string;
}): Promise<GeminiResult<T>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "A chave do Gemini (GEMINI_API_KEY) não está configurada no servidor." };

  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });

    const finish = response.candidates?.[0]?.finishReason;
    if (response.promptFeedback?.blockReason || finish === "SAFETY" || finish === "PROHIBITED_CONTENT") {
      return { ok: false, error: "O Gemini recusou este conteúdo. Revise o texto e tente de novo." };
    }
    if (finish === "MAX_TOKENS") return { ok: false, error: "A resposta do Gemini foi cortada. Tente novamente." };

    const text = response.text;
    if (!text) return { ok: false, error: "O Gemini não devolveu resposta. Tente novamente." };
    return { ok: true, data: JSON.parse(text) as T };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 400 && /api key/i.test(error.message)) {
        return { ok: false, error: "A chave do Gemini é inválida." };
      }
      if (error.status === 401 || error.status === 403) {
        return { ok: false, error: "A chave do Gemini não tem permissão. Confira o projeto no AI Studio." };
      }
      if (error.status === 429) {
        return { ok: false, error: "Limite de uso do Gemini atingido. Tente de novo em alguns minutos." };
      }
      if (error.status >= 500) return { ok: false, error: "O Gemini está instável agora. Tente de novo em instantes." };
      return { ok: false, error: `Erro do Gemini (${error.status}). Tente novamente.` };
    }
    if (error instanceof SyntaxError) return { ok: false, error: "O Gemini devolveu uma resposta inválida. Tente novamente." };
    return { ok: false, error: "Não foi possível falar com o Gemini. Tente novamente." };
  }
}
