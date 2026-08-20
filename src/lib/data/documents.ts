import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"] & {
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
};

export type DocumentWithUrl = DocumentRow & { downloadUrl: string | null };

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function listDocuments(filter?: { clientId?: string }): Promise<DocumentWithUrl[]> {
  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select("*, clients(name), profiles(full_name)")
    .order("created_at", { ascending: false });
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);
  const { data, error } = await query;
  if (error) throw error;

  return Promise.all(
    data.map(async (doc) => {
      const { data: signed } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS);
      return { ...doc, downloadUrl: signed?.signedUrl ?? null };
    })
  );
}
