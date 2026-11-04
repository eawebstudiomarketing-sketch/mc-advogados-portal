import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerateContentResponseUsageMetadata } from "@google/genai";
import { createAdminClient } from "@/lib/supabase/admin";

// Medidor de consumo do Gemini (04/11/2026). Cada chamada grava função, modelo,
// tokens e custo estimado em uso_ia (migration 0067). Nunca derruba quem chamou:
// sem tabela ou com erro, só não registra.
//
// Preço em US$ por 1M tokens (entrada texto/saída), out/2026. Áudio de entrada
// custa ~3x o texto; token em cache ~10% da entrada. É estimativa: a conta
// oficial é a do AI Studio.
const PRECOS: Record<string, { entrada: number; saida: number }> = {
  "gemini-3.1-flash-lite": { entrada: 0.25, saida: 1.5 },
  "gemini-3.8-flash": { entrada: 0.75, saida: 3.75 },
  "gemini-flash-latest": { entrada: 0.75, saida: 3.75 },
};
const PRECO_PADRAO = { entrada: 0.75, saida: 3.75 }; // modelo desconhecido: conta pelo mais caro

export function custoUsd(modelo: string, u: GenerateContentResponseUsageMetadata | undefined) {
  const p = PRECOS[modelo] ?? PRECO_PADRAO;
  const entrada = u?.promptTokenCount ?? 0;
  const cache = u?.cachedContentTokenCount ?? 0;
  const audio = (u?.promptTokensDetails ?? []).filter((d) => d.modality === "AUDIO").reduce((s, d) => s + (d.tokenCount ?? 0), 0);
  const saida = (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
  const texto = Math.max(0, entrada - cache - audio);
  const usd = (texto * p.entrada + audio * p.entrada * 3 + cache * p.entrada * 0.1 + saida * p.saida) / 1_000_000;
  return { entrada, cache, audio, saida, usd };
}

export async function registrarUsoIA(funcao: string, modelo: string, u: GenerateContentResponseUsageMetadata | undefined): Promise<void> {
  if (!u) return;
  try {
    const c = custoUsd(modelo, u);
    const db = createAdminClient() as unknown as SupabaseClient;
    await db.from("uso_ia").insert({ funcao, modelo, entrada: c.entrada, cache: c.cache, audio: c.audio, saida: c.saida, custo_usd: Number(c.usd.toFixed(6)) });
  } catch {
    /* medidor não pode quebrar a função */
  }
}
