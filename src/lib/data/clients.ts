import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Client = Database["public"]["Tables"]["clients"]["Row"];

// Arquivados ficam fora das listas, a menos que peça (arquivados: true = só eles).
export async function listClients(opts?: { arquivados?: boolean }): Promise<Client[]> {
  const supabase = await createClient();
  let q = supabase.from("clients").select("*").order("name");
  q = opts?.arquivados ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  return data;
}
