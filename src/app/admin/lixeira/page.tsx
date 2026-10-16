import { requireRole } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRASH_DAYS } from "@/lib/trash";
import { RestoreButton } from "./restore-button";

export const dynamic = "force-dynamic";

function clean(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

function whenText(iso: string): string {
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", ...o }).format(d);
  return `${f({ day: "2-digit", month: "2-digit", year: "numeric" })} às ${f({ hour: "2-digit", minute: "2-digit" })}`;
}

type Row = { id: string; batch_id: string; client_id: string; title: string; reason: string; deleted_at: string; deleted_by: string | null };
type Batch = { id: string; clientId: string; reason: string; deletedAt: string; deletedBy: string | null; titles: string[]; count: number };

// Lixeira do portal: tudo que foi removido fica aqui 30 dias, agrupado pelo
// que saiu junto. Os arquivos no Google Drive nunca são apagados pelo portal.
export default async function LixeiraPage() {
  await requireRole(["admin"]);
  const admin = createAdminClient();

  const rows: Row[] = [];
  let missing = false;
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await admin
      .from("documents_trash")
      .select("id, batch_id, client_id, title, reason, deleted_at, deleted_by")
      .order("deleted_at", { ascending: false })
      .order("id")
      .range(from, from + 999);
    if (error) {
      missing = true;
      break;
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const batches = new Map<string, Batch>();
  for (const r of rows) {
    const b = batches.get(r.batch_id) ?? { id: r.batch_id, clientId: r.client_id, reason: r.reason, deletedAt: r.deleted_at, deletedBy: r.deleted_by, titles: [], count: 0 };
    b.count++;
    if (b.titles.length < 5) b.titles.push(r.title);
    batches.set(r.batch_id, b);
  }
  const list = [...batches.values()].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  const clientIds = [...new Set(list.map((b) => b.clientId))];
  const profileIds = [...new Set(list.map((b) => b.deletedBy).filter((x): x is string => !!x))];
  const [{ data: clients }, { data: profiles }] = await Promise.all([
    clientIds.length ? admin.from("clients").select("id, name").in("id", clientIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    profileIds.length ? admin.from("profiles").select("id, full_name").in("id", profileIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ]);
  const clientName = new Map((clients ?? []).map((c) => [c.id, clean(c.name)]));
  const who = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-2">Gestão · Lixeira</p>
        <h1 className="page-title">Lixeira</h1>
        <p className="text-sm text-muted">
          Documentos removidos do portal ficam aqui por {TRASH_DAYS} dias e podem ser restaurados. Os arquivos no Google Drive nunca são apagados pelo portal.
        </p>
      </div>

      {missing ? (
        <p className="rounded-xl border border-status-pending px-4 py-4 text-sm text-status-pending">A lixeira ainda não foi ativada no banco (migration 0012).</p>
      ) : list.length === 0 ? (
        <p className="ui-card px-4 py-4 text-sm text-muted">A lixeira está vazia.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((b) => {
            const purgeAt = new Date(new Date(b.deletedAt).getTime() + TRASH_DAYS * 86_400_000).toISOString();
            const cName = clientName.get(b.clientId);
            return (
              <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 ui-card px-4 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-foreground">
                    {b.count} documento(s) — {cName ?? <span className="text-status-danger">cliente excluído</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {b.reason} · {whenText(b.deletedAt)}
                    {b.deletedBy && who.get(b.deletedBy) ? ` · por ${who.get(b.deletedBy)}` : ""} · some de vez em {whenText(purgeAt).split(" às ")[0]}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {b.titles.join(" · ")}
                    {b.count > b.titles.length ? ` · e mais ${b.count - b.titles.length}` : ""}
                  </p>
                </div>
                {cName ? <RestoreButton batchId={b.id} count={b.count} /> : <span className="text-xs text-muted">não dá pra restaurar</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
