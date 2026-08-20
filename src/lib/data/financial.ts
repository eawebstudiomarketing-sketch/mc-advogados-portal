import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type FinancialRecord = Database["public"]["Tables"]["financial_records"]["Row"] & {
  clients: { name: string } | null;
};

export async function listFinancialRecords(filter?: { clientId?: string }): Promise<FinancialRecord[]> {
  const supabase = await createClient();
  let query = supabase
    .from("financial_records")
    .select("*, clients(name)")
    .order("due_date", { ascending: true });
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
