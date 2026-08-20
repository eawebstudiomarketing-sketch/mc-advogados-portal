import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Activity = Database["public"]["Tables"]["activities"]["Row"] & {
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
};

export async function listActivities(filter?: { clientId?: string }): Promise<Activity[]> {
  const supabase = await createClient();
  let query = supabase
    .from("activities")
    .select("*, clients(name), profiles(full_name)")
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getActivity(id: string): Promise<Activity | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, clients(name), profiles(full_name)")
    .eq("id", id)
    .maybeSingle();
  return data;
}
