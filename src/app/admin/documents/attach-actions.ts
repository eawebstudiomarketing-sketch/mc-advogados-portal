"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";

// Vincula um documento que JÁ está no cliente a um processo ou a uma atividade
// (ex.: os arquivos que vieram do Drive). Só aceita documento do mesmo cliente.
export async function attachDocumentAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "advogado"]);
  const documentId = formData.get("document_id");
  const processId = formData.get("process_id");
  const activityId = formData.get("activity_id");
  if (typeof documentId !== "string" || !documentId) return;

  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("client_id").eq("id", documentId).maybeSingle();
  if (!doc) return;

  if (typeof processId === "string" && processId) {
    const { data: p } = await supabase.from("processes").select("client_id").eq("id", processId).maybeSingle();
    if (!p || p.client_id !== doc.client_id) return;
    await supabase.from("documents").update({ process_id: processId }).eq("id", documentId);
    revalidatePath(`/admin/processes/${processId}`);
  } else if (typeof activityId === "string" && activityId) {
    const { data: a } = await supabase.from("activities").select("client_id").eq("id", activityId).maybeSingle();
    if (!a || a.client_id !== doc.client_id) return;
    await supabase.from("documents").update({ activity_id: activityId }).eq("id", documentId);
    revalidatePath(`/admin/activities/${activityId}`);
  }
  revalidatePath("/admin/documents");
}
