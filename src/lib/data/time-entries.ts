import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"] & {
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
};

export async function listTimeEntries(filter?: { clientId?: string }): Promise<TimeEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("time_entries")
    .select("*, clients(name), profiles(full_name)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
