import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type StaffProfile = Database["public"]["Tables"]["profiles"]["Row"];

export async function listStaff(): Promise<StaffProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["admin", "advogado"])
    .eq("oculto", false)
    .order("full_name");
  if (error) throw error;
  return data;
}

/** Ids dos advogados designados ao cliente. */
export async function listDesignados(clientId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("equipe_clientes").select("profile_id").eq("client_id", clientId);
  return (data ?? []).map((d) => d.profile_id);
}

/** Designações de todos os advogados: profile_id → client_ids (só admin enxerga todas). */
export async function listDesignacoes(): Promise<Map<string, string[]>> {
  const supabase = await createClient();
  const { data } = await supabase.from("equipe_clientes").select("profile_id, client_id");
  const m = new Map<string, string[]>();
  for (const d of data ?? []) m.set(d.profile_id, [...(m.get(d.profile_id) ?? []), d.client_id]);
  return m;
}

/** Permissões salvas de cada advogado (cru; resolver com resolverPermissoes). */
export async function listPermissoesSalvas(): Promise<Map<string, unknown>> {
  const supabase = await createClient();
  const { data } = await supabase.from("equipe_permissoes").select("profile_id, permissoes");
  return new Map((data ?? []).map((d) => [d.profile_id, d.permissoes]));
}

export async function getClientPortalUser(clientId: string): Promise<StaffProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("client_id", clientId)
    .eq("role", "client")
    .maybeSingle();
  return data;
}
