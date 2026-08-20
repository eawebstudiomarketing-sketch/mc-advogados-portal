import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"] & {
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
};

export async function listTimeEntries(): Promise<TimeEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .select("*, clients(name), profiles(full_name)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
