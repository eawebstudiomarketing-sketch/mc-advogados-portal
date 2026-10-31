import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Regimento } from "./tipos";

// Leitura dos regimentos pela sessão (RLS: tela Onboarding + acesso ao cliente).
// A tabela (0063) ainda não está nos tipos gerados.
const db = async () => (await createClient()) as unknown as SupabaseClient;

export async function listRegimentos(clientId?: string): Promise<Regimento[]> {
  let q = (await db()).from("regimentos").select("*, clients(name)").order("created_at", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  // sem a migration 0063 a tela mostra vazio em vez de quebrar
  if (error) return [];
  return (data ?? []) as Regimento[];
}

export async function getRegimento(id: string): Promise<Regimento | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await (await db()).from("regimentos").select("*, clients(name)").eq("id", id).maybeSingle();
  return (data as Regimento | null) ?? null;
}
