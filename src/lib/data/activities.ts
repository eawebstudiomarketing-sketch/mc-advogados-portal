import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Activity = Database["public"]["Tables"]["activities"]["Row"] & {
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
};

export async function listActivities(): Promise<Activity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .select("*, clients(name), profiles(full_name)")
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
