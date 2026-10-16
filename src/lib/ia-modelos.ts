// Modelo do Gemini usado em cada tarefa (decisão do usuário, 08/10/2026:
// economizar; o 3.8 Flash só onde precisa, como a transcrição de áudio).
// Dá para trocar sem mexer no código: variável de ambiente GEMINI_MODELO_<TAREFA>.
//
// Preços de referência (US$ por 1M tokens, entrada/saída, out/2026):
//   3.1 Flash-Lite 0,25/1,50 · 3.8 Flash 0,75/3,75 (dobra em 2027). A família 2.x (2.0/2.5)
//   não está mais disponível para contas novas (testado em 08/10/2026).
export const MODELOS = {
  /** áudio → texto (🎙 do onboarding e do assistente) */
  transcricao: process.env.GEMINI_MODELO_TRANSCRICAO ?? "gemini-flash-latest",
  /** perguntas do onboarding a partir da ficha de handoff */
  onboarding: process.env.GEMINI_MODELO_ONBOARDING ?? "gemini-3.1-flash-lite",
  /** demandas a partir de ficha/ATAs/documentos */
  demandas: process.env.GEMINI_MODELO_DEMANDAS ?? "gemini-3.1-flash-lite",
  /** ler os grupos do WhatsApp e sugerir demandas (Distribuição) */
  distribuicao: process.env.GEMINI_MODELO_DISTRIBUICAO ?? "gemini-3.1-flash-lite",
  /** assistente do balão (conversa + ferramentas) */
  assistente: process.env.GEMINI_MODELO_ASSISTENTE ?? "gemini-3.1-flash-lite",
  /** ler documento/arquivo do Drive e responder */
  leitura: process.env.GEMINI_MODELO_LEITURA ?? "gemini-3.1-flash-lite",
} as const;
