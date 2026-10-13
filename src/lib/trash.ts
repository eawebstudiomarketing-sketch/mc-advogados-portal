import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Lixeira de documentos (migration 0012). Todo documento apagado passa por
// aqui (ou pelo gatilho do banco, que pega até exclusões em cascata): fica 30
// dias restaurável. O arquivo físico só é apagado na limpeza, e só o do
// Storage: o portal nunca apaga nada no Google Drive.

export const TRASH_DAYS = 30;

export type TrashMeta = { relink_client_id?: string; relink_folder_id?: string };

// Remove vários documentos como UM lote. Sem a migration 0012, recusa (melhor
// não remover do que remover sem volta).
export async function trashDocuments(ids: string[], reason: string, by: string | null, meta?: TrashMeta) {
  if (ids.length === 0) return { batchId: null as string | null, removed: 0 };
  const { data, error } = await createAdminClient().rpc("trash_documents", { p_ids: ids, p_reason: reason, p_by: by, p_meta: meta ?? null });
  if (error || !data?.[0]) {
    console.error("trash_documents falhou", error);
    throw new Error("Não foi possível mover os documentos para a lixeira. Nada foi removido.");
  }
  return { batchId: data[0].batch_id, removed: data[0].removed };
}

// Restaura um lote. Se o lote veio de uma pasta desligada, liga a pasta de novo.
export async function restoreBatch(batchId: string) {
  const admin = createAdminClient();
  const { data: sample } = await admin.from("documents_trash").select("meta").eq("batch_id", batchId).limit(1).maybeSingle();
  const { data, error } = await admin.rpc("restore_documents", { p_batch: batchId });
  if (error || !data?.[0]) {
    console.error("restore_documents falhou", error);
    throw new Error("Não foi possível restaurar.");
  }

  const meta = (sample?.meta ?? null) as TrashMeta | null;
  let relinked = false;
  if (meta?.relink_client_id && meta.relink_folder_id) {
    const { data: c } = await admin.from("clients").select("drive_import_folder_ids").eq("id", meta.relink_client_id).maybeSingle();
    if (c) {
      const cur = c.drive_import_folder_ids ?? [];
      if (!cur.includes(meta.relink_folder_id)) {
        await admin.from("clients").update({ drive_import_folder_ids: [...cur, meta.relink_folder_id] }).eq("id", meta.relink_client_id);
      }
      relinked = true;
    }
  }
  return { restored: data[0].restored, skipped: data[0].skipped, relinked };
}

// Limpeza (rodada da madrugada): o que está na lixeira há mais de 30 dias sai
// de vez; arquivos do Storage desses documentos são apagados. Drive: nunca.
export async function purgeTrash(): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString();
  let purged = 0;
  for (;;) {
    const { data, error } = await admin.from("documents_trash").select("id, data").lt("deleted_at", cutoff).limit(200);
    if (error || !data || data.length === 0) break;
    const ids = data.map((r) => r.id);
    // não apaga arquivo que ainda é usado por algum documento ativo
    const paths = data.flatMap((r) => {
      const d = r.data as { file_path?: string; legacy_file_path?: string | null };
      return [d.file_path, d.legacy_file_path].filter((p): p is string => !!p && !p.startsWith("drive/"));
    });
    let unused = paths;
    if (paths.length) {
      const { data: inUse } = await admin.from("documents").select("file_path").in("file_path", paths);
      const used = new Set((inUse ?? []).map((d) => d.file_path));
      unused = paths.filter((p) => !used.has(p));
    }
    if (unused.length) await admin.storage.from("documents").remove(unused);
    const { error: delErr } = await admin.from("documents_trash").delete().in("id", ids);
    if (delErr) break;
    purged += ids.length;
    if (data.length < 200) break;
  }
  return purged;
}
