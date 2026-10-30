import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Canal, Formato } from "./notificacoes-tipos";

// Preferências de notificação (Minha conta › Notificações). Sem linha gravada = ligado e completo.

const db = () => createAdminClient() as unknown as SupabaseClient;

export type Preferencia = { ativo: boolean; formato: Formato };
const PADRAO: Preferencia = { ativo: true, formato: "completa" };

/** Preferência de uma pessoa para um tipo de aviso num canal. */
export async function preferenciaDe(profileId: string | null | undefined, tipo: string, canal: Canal): Promise<Preferencia> {
  if (!profileId) return PADRAO;
  const { data } = await db().from("notificacao_preferencias").select("ativo, formato").eq("profile_id", profileId).eq("tipo", tipo).eq("canal", canal).maybeSingle();
  return data ? { ativo: !!data.ativo, formato: data.formato as Formato } : PADRAO;
}

/** Preferências de várias pessoas de uma vez (para envios em lote): profile_id → preferência. */
export async function preferenciasDe(profileIds: string[], tipo: string, canal: Canal): Promise<Map<string, Preferencia>> {
  const out = new Map<string, Preferencia>();
  if (!profileIds.length) return out;
  const { data } = await db().from("notificacao_preferencias").select("profile_id, ativo, formato").eq("tipo", tipo).eq("canal", canal).in("profile_id", profileIds);
  for (const r of data ?? []) out.set(r.profile_id as string, { ativo: !!r.ativo, formato: r.formato as Formato });
  return out;
}

export const preferenciaOuPadrao = (m: Map<string, Preferencia>, profileId: string | null | undefined): Preferencia => (profileId ? m.get(profileId) : undefined) ?? PADRAO;

/** Todas as preferências gravadas de uma pessoa: "tipo|canal" → preferência. */
export async function preferenciasDaPessoa(profileId: string): Promise<Map<string, Preferencia>> {
  const { data } = await db().from("notificacao_preferencias").select("tipo, canal, ativo, formato").eq("profile_id", profileId);
  return new Map((data ?? []).map((r) => [`${r.tipo}|${r.canal}`, { ativo: !!r.ativo, formato: r.formato as Formato }]));
}

export async function gravarPreferencia(profileId: string, tipo: string, canal: Canal, ativo: boolean, formato: Formato) {
  const { error } = await db()
    .from("notificacao_preferencias")
    .upsert({ profile_id: profileId, tipo, canal, ativo, formato, updated_at: new Date().toISOString() }, { onConflict: "profile_id,tipo,canal" });
  if (error) throw new Error(error.message);
}
