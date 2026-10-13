import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type DemandDraft = Database["public"]["Tables"]["onboarding_demand_drafts"]["Row"];

export async function listDemandDrafts(onboardingId: string): Promise<DemandDraft[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_demand_drafts")
    .select("*")
    .eq("onboarding_id", onboardingId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listClientDemandDrafts(clientId: string): Promise<DemandDraft[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_demand_drafts")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .order("position", { ascending: true });
  if (error) throw error;
  return data;
}
