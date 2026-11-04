import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Novidades do portal (04/11/2026), no estilo do "What's new" do Chrome: cada
// mudança visível ou função nova vira uma novidade com prints e como usar. Abre
// sozinha UMA vez para cada pessoa da equipe (a mais nova que ela ainda não
// viu); depois fica em Caixa de entrada → Novidades.

export type ItemNovidade = { titulo: string; texto: string; como_usar?: string[]; imagem?: string | null; link?: string | null };
export type Novidade = { id: string; titulo: string; resumo: string | null; itens: ItemNovidade[]; publicada_em: string };

// tabelas da migration 0066 (fora do types.ts gerado)
const db = () => createAdminClient() as unknown as SupabaseClient;

export async function listarNovidades(limite = 30): Promise<Novidade[]> {
  const { data } = await db().from("novidades").select("id, titulo, resumo, itens, publicada_em").lte("publicada_em", new Date().toISOString()).order("publicada_em", { ascending: false }).limit(limite);
  return (data ?? []) as Novidade[];
}

/** A novidade mais nova que a pessoa ainda não viu (só das últimas 3 semanas, para quem entra depois não receber uma fila antiga). */
export async function novidadePendente(profileId: string): Promise<Novidade | null> {
  const desde = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const { data } = await db().from("novidades").select("id, titulo, resumo, itens, publicada_em").gte("publicada_em", desde).lte("publicada_em", new Date().toISOString()).order("publicada_em", { ascending: false }).limit(1);
  const n = (data?.[0] ?? null) as Novidade | null;
  if (!n) return null;
  const { count } = await db().from("novidades_vistas").select("novidade_id", { count: "exact", head: true }).eq("novidade_id", n.id).eq("profile_id", profileId);
  return count ? null : n;
}

/** Marca como vista esta e as anteriores (fechar a janela não deixa fila de novidades velhas). */
export async function marcarNovidadesVistas(profileId: string, ateId: string): Promise<void> {
  const { data: alvo } = await db().from("novidades").select("publicada_em").eq("id", ateId).maybeSingle();
  if (!alvo) return;
  const { data } = await db().from("novidades").select("id").lte("publicada_em", alvo.publicada_em);
  const linhas = (data ?? []).map((n) => ({ novidade_id: n.id, profile_id: profileId }));
  if (linhas.length) await db().from("novidades_vistas").upsert(linhas, { onConflict: "novidade_id,profile_id", ignoreDuplicates: true });
}
