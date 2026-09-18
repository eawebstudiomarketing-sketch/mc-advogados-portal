import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"] & {
  clients: { name: string } | null;
  profiles: { full_name: string } | null;
};

export type DocumentWithUrl = DocumentRow & { downloadUrl: string | null };

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function listDocuments(filter?: {
  clientId?: string;
  activityId?: string;
  processId?: string;
}): Promise<DocumentWithUrl[]> {
  const supabase = await createClient();
  let query = supabase
    .from("documents")
    .select("*, clients(name), profiles(full_name)")
    .order("created_at", { ascending: false });
  if (filter?.clientId) query = query.eq("client_id", filter.clientId);
  if (filter?.activityId) query = query.eq("activity_id", filter.activityId);
  if (filter?.processId) query = query.eq("process_id", filter.processId);
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

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("*, clients(name), profiles(full_name)")
    .eq("id", id)
    .maybeSingle();
  return data;
}
