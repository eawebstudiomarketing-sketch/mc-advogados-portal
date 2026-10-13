import "server-only";
import { createClient } from "@/lib/supabase/server";
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
  return data;
}

export async function getActivity(id: string): Promise<Activity | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, clients(name), profiles(full_name), responsaveis(nome)")
    .eq("id", id)
    .maybeSingle();
  return data;
}
