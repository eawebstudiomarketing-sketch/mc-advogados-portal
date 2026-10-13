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
      // Documento no Google Drive: o download passa pelo portal, que checa a
      // permissão (ver app/api/documents/[id]/download).
      if (doc.drive_file_id) return { ...doc, downloadUrl: `/api/documents/${doc.id}/download` };
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

export type DocumentsPage = {
  items: DocumentWithUrl[];
  total: number;
  page: number;
  totalPages: number;
};

// Uma página de documentos (mais recentes primeiro), com o total. A página é
// ajustada se pedirem uma que não existe (ex.: depois de apagar documentos).
export async function listDocumentsPage(
  filter: { clientId?: string; activityId?: string; processId?: string; semAtas?: boolean },
  paging: { page: number; pageSize: number }
): Promise<DocumentsPage> {
  const supabase = await createClient();
  const size = Math.max(1, paging.pageSize);

  const run = async (page: number) => {
    let query = supabase
      .from("documents")
      .select("*, clients(name), profiles(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true }) // desempate: importações em lote têm a mesma data
      .range((page - 1) * size, page * size - 1);
    if (filter.clientId) query = query.eq("client_id", filter.clientId);
    if (filter.activityId) query = query.eq("activity_id", filter.activityId);
    if (filter.processId) query = query.eq("process_id", filter.processId);
    if (filter.semAtas) query = query.neq("category", "ata");
    const { data, count, error } = await query;
    if (error) throw error;
    return { data, count: count ?? 0 };
  };

  let page = Math.max(1, Math.floor(paging.page) || 1);
  let { data, count } = await run(page);
  const totalPages = Math.max(1, Math.ceil(count / size));
  if (page > totalPages) {
    page = totalPages;
    ({ data, count } = await run(page));
  }

  const items = await Promise.all(
    data.map(async (doc) => {
      if (doc.drive_file_id) return { ...doc, downloadUrl: `/api/documents/${doc.id}/download` };
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS);
      return { ...doc, downloadUrl: signed?.signedUrl ?? null };
    })
  );
  return { items, total: count, page, totalPages };
}

// ATAs de reunião do cliente (internas: o cliente não vê). Mais recentes primeiro.
export async function listAtas(clientId: string): Promise<DocumentWithUrl[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*, clients(name), profiles(full_name)")
    .eq("client_id", clientId)
    .eq("category", "ata")
    .order("meeting_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return Promise.all(
    data.map(async (doc) => {
      if (doc.drive_file_id) return { ...doc, downloadUrl: `/api/documents/${doc.id}/download` };
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS);
      return { ...doc, downloadUrl: signed?.signedUrl ?? null };
    })
  );
}
