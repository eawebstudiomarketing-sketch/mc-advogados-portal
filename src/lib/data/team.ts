import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type StaffProfile = Database["public"]["Tables"]["profiles"]["Row"];

export async function listStaff(): Promise<StaffProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["admin", "advogado"])
    .order("full_name");
  if (error) throw error;
  return data;
}

export async function getClientPortalUser(clientId: string): Promise<StaffProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("client_id", clientId)
    .eq("role", "client")
    .maybeSingle();
  return data;
}
