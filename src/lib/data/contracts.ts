import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Contract = Database["public"]["Tables"]["contracts"]["Row"] & {
  clients: { name: string } | null;
};

export async function listContracts(filter?: { clientId?: string }): Promise<Contract[]> {
  const supabase = await createClient();
  let query = supabase
    .from("contracts")
    .select("*, clients(name)")
    .order("start_date", { ascending: false });
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getContract(id: string): Promise<Contract | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("contracts").select("*, clients(name)").eq("id", id).maybeSingle();
  return data;
}
