import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Quem da equipe escreveu no WhatsApp. Resposta ao cliente = qualquer coisa
// que sai do número do escritório (portal ou celular) OU mensagem de alguém
// da equipe (Fran, Alice, Maurício, Talita…) nos grupos de assessoria, que
// chega com o número pessoal da pessoa em sender_jid. O telefone vem de
// Responsáveis. (Mensagens de grupo antes de 16/10 não têm remetente.)

const db = () => createAdminClient() as unknown as SupabaseClient;

/** DDD + 8 últimos dígitos: casa 5573998486207, 557398486207 e 73998486207. */
export function chaveFone(v: string | null | undefined): string | null {
  let d = String(v ?? "").split("@")[0].replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10) return null;
  return d.slice(0, 2) + d.slice(-8);
}

/** Variantes do JID de um telefone (com e sem o 9), para buscar por sender_jid. */
export function jidsDoFone(telefone: string | null | undefined): string[] {
  const k = chaveFone(telefone);
  if (!k) return [];
  return [`55${k}@s.whatsapp.net`, `55${k.slice(0, 2)}9${k.slice(2)}@s.whatsapp.net`];
}

/** Devolve uma função sender_jid → profile_id da pessoa da equipe (ou null). */
export async function equipeNoZap(): Promise<(senderJid: string | null | undefined) => string | null> {
  const [{ data: resps }, { data: supers }] = await Promise.all([
    db().from("responsaveis").select("profile_id, telefone").not("telefone", "is", null),
    db().from("profiles").select("id").eq("super_admin", true),
  ]);
  const superIds = new Set(((supers ?? []) as { id: string }[]).map((s) => s.id));
  const mapa = new Map<string, string>();
  for (const r of (resps ?? []) as { profile_id: string | null; telefone: string | null }[]) {
    const k = chaveFone(r.telefone);
    if (!k || !r.profile_id) continue;
    // mesmo telefone em dois perfis (ex.: Maurício): fica o admin máximo
    if (!mapa.has(k) || superIds.has(r.profile_id)) mapa.set(k, r.profile_id);
  }
  return (jid) => {
    if (!jid || jid.endsWith("@g.us")) return null;
    const k = chaveFone(jid);
    return k ? mapa.get(k) ?? null : null;
  };
}
