import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehFeriadoNacional } from "@/lib/publicacoes/sugestoes";
import { normalizarRegras, REGRAS_PADRAO, type RegrasRotina } from "./regras-base";

// Regras da rotina no banco (escritorio_config.rotina_regras, 06/11/2026).
// Ver regras-base.ts. Sem a coluna (migration 0072 não aplicada), valem os padrões.

const db = () => createAdminClient() as unknown as SupabaseClient;

export const lerRegras = cache(async (): Promise<RegrasRotina> => {
  const { data, error } = await db().from("escritorio_config").select("rotina_regras").eq("id", 1).maybeSingle();
  if (error || !data) return REGRAS_PADRAO;
  return normalizarRegras(data.rotina_regras);
});

export async function salvarRegras(regras: unknown): Promise<RegrasRotina> {
  const r = normalizarRegras(regras);
  const { error } = await db().from("escritorio_config").update({ rotina_regras: r, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) throw new Error(/rotina_regras/.test(error.message) ? "Falta rodar a migration 0072 no banco." : "Não foi possível salvar as regras.");
  return r;
}

/** O dia tem relatório? (dias da semana marcados e, se pedido, fora dos feriados nacionais) */
export function ehDiaDeRelatorio(dia: string, r: RegrasRotina): boolean {
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
  if (!r.dias.includes(dow)) return false;
  return !(r.pularFeriados && ehFeriadoNacional(dia));
}
