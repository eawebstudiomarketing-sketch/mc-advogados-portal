import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Process = Database["public"]["Tables"]["processes"]["Row"] & {
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
};

export async function listProcesses(filter?: { clientId?: string }): Promise<Process[]> {
  const supabase = await createClient();
  let query = supabase
    .from("processes")
    .select("*, clients(name), profiles(full_name)")
    .order("created_at", { ascending: false });
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getProcess(id: string): Promise<Process | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("processes")
    .select("*, clients(name), profiles(full_name)")
    .eq("id", id)
    .maybeSingle();
  return data;
}
