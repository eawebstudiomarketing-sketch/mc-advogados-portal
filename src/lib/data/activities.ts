import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

export type Activity = Database["public"]["Tables"]["activities"]["Row"] & {
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
  responsaveis: { nome: string } | null;
};

// Arquivadas ficam fora, a menos que peça (arquivadas: true = só elas).
export async function listActivities(filter?: { clientId?: string; arquivadas?: boolean }): Promise<Activity[]> {
  const supabase = await createClient();
  let query = supabase
    .from("activities")
    .select("*, clients(name), profiles(full_name), responsaveis(nome)")
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);
  query = filter?.arquivadas ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return comNomeDoCliente(data);
}

export async function getActivity(id: string): Promise<Activity | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, clients(name), profiles(full_name), responsaveis(nome)")
    .eq("id", id)
    .maybeSingle();
  return data ? (await comNomeDoCliente([data]))[0] : null;
}

/**
 * Responsável de fora da empresa vê a atividade, mas não a ficha do cliente
 * (o banco esconde o cliente). Aqui vai só o nome, pra lista não ficar sem
 * empresa. Só roda para atividades que a pessoa já pode ver.
 */
async function comNomeDoCliente(lista: Activity[]): Promise<Activity[]> {
  const faltam = [...new Set(lista.filter((a) => a.client_id && !a.clients).map((a) => a.client_id))];
  if (!faltam.length) return lista;
  const { data } = await createAdminClient().from("clients").select("id, name").in("id", faltam);
  const nome = new Map((data ?? []).map((c) => [c.id, c.name]));
  return lista.map((a) => (a.clients || !nome.has(a.client_id) ? a : { ...a, clients: { name: nome.get(a.client_id)! } }));
}
