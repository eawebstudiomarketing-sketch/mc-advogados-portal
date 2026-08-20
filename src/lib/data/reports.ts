import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type MonthlyReport = Database["public"]["Tables"]["monthly_reports"]["Row"] & {
  clients: { name: string } | null;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function listReports(filter?: { clientId?: string }): Promise<(MonthlyReport & { downloadUrl: string | null })[]> {
  const supabase = await createClient();
  let query = supabase
    .from("monthly_reports")
    .select("*, clients(name)")
    .order("reference_year", { ascending: false })
    .order("reference_month", { ascending: false });
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);
  const { data, error } = await query;
  if (error) throw error;

  return Promise.all(
    data.map(async (report) => {
      if (!report.pdf_url) return { ...report, downloadUrl: null };
      const { data: signed } = await supabase.storage
        .from("documents")
        .createSignedUrl(report.pdf_url, SIGNED_URL_TTL_SECONDS);
      return { ...report, downloadUrl: signed?.signedUrl ?? null };
    })
  );
}
