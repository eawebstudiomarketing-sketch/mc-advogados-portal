import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { OnboardingAnswers } from "@/lib/onboarding-schema";

export type Onboarding = Omit<Database["public"]["Tables"]["onboardings"]["Row"], "answers"> & {
  answers: OnboardingAnswers;
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function listOnboardings(filter?: { clientId?: string }): Promise<(Onboarding & { downloadUrl: string | null })[]> {
  const supabase = await createClient();
  let query = supabase
    .from("onboardings")
    .select("*, clients(name), profiles(full_name)")
    .order("created_at", { ascending: false });
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);
  const { data, error } = await query;
  if (error) throw error;

  return Promise.all(
    (data as unknown as Onboarding[]).map(async (onboarding) => {
      if (!onboarding.pdf_url) return { ...onboarding, downloadUrl: null };
      const { data: signed } = await supabase.storage
        .from("documents")
        .createSignedUrl(onboarding.pdf_url, SIGNED_URL_TTL_SECONDS);
      return { ...onboarding, downloadUrl: signed?.signedUrl ?? null };
    })
  );
}

export async function getOnboarding(id: string): Promise<(Onboarding & { downloadUrl: string | null }) | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboardings")
    .select("*, clients(name), profiles(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  const onboarding = data as unknown as Onboarding;
  if (!onboarding.pdf_url) return { ...onboarding, downloadUrl: null };
  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(onboarding.pdf_url, SIGNED_URL_TTL_SECONDS);
  return { ...onboarding, downloadUrl: signed?.signedUrl ?? null };
}
