import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Contract = Database["public"]["Tables"]["contracts"]["Row"] & {
  clients: { name: string } | null;
};

export async function listContracts(): Promise<Contract[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select("*, clients(name)")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}
