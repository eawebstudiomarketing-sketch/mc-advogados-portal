import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Process = Database["public"]["Tables"]["processes"]["Row"] & {
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
};

export async function listProcesses(): Promise<Process[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("processes")
    .select("*, clients(name), profiles(full_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
