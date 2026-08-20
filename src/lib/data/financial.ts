import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type FinancialRecord = Database["public"]["Tables"]["financial_records"]["Row"] & {
  clients: { name: string } | null;
};

export async function listFinancialRecords(): Promise<FinancialRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_records")
    .select("*, clients(name)")
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data;
}
