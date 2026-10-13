import { createClient } from "@/lib/supabase/server";
import { attachDocumentAction } from "@/app/admin/documents/attach-actions";

// "Anexar um documento que já está no cliente": lista simples dos documentos do
// cliente (inclusive os que vieram do Drive) que ainda não estão neste
// processo/atividade.
export async function AttachExistingDocument({
  clientId,
  processId,
  activityId,
}: {
  clientId: string;
  processId?: string;
  activityId?: string;
}) {
  const supabase = await createClient();
  let q = supabase.from("documents").select("id, title, category").eq("client_id", clientId).order("created_at", { ascending: false }).limit(300);
  if (processId) q = q.or(`process_id.is.null,process_id.neq.${processId}`);
  if (activityId) q = q.or(`activity_id.is.null,activity_id.neq.${activityId}`);
  const { data } = await q;
  const docs = data ?? [];
  if (docs.length === 0) return null;

  return (
    <details className="mt-3 rounded-lg border border-border px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-navy">Anexar um documento que já está no cliente</summary>
      <form action={attachDocumentAction} className="mt-3 flex flex-wrap items-center gap-2">
        {processId && <input type="hidden" name="process_id" value={processId} />}
        {activityId && <input type="hidden" name="activity_id" value={activityId} />}
        <select name="document_id" required className="min-w-[240px] flex-1 rounded-lg border border-border bg-background px-2 py-1.5">
          <option value="">Escolha o documento...</option>
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
        <button type="submit" className="ui-btn">
          Anexar
        </button>
      </form>
    </details>
  );
}
