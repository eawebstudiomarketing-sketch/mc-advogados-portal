import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriveConnection, getDriveSession } from "@/lib/google-drive";
import { syncAllClients, systemCtx } from "@/lib/drive-sync";
import { purgeTrash } from "@/lib/trash";

import { cronAutorizado } from "@/lib/seguranca";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rodada automática (Vercel Cron, ver vercel.json): sincroniza todos os clientes
// com o Drive. A Vercel manda "Authorization: Bearer $CRON_SECRET".
// Tem limite de tempo: o que não couber fica pra próxima rodada (que começa
// pelos clientes sincronizados há mais tempo).
export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Lixeira: o que passou de 30 dias sai de vez (rápido; não depende do Drive).
  const purged = await purgeTrash().catch((e) => {
    console.error("Limpeza da lixeira falhou", e);
    return 0;
  });

  const session = await getDriveSession().catch(() => null);
  if (!session) {
    return NextResponse.json({ ok: false, note: "Drive não conectado ou sem resposta — nada sincronizado." });
  }

  // "quem" registra os arquivos trazidos: quem conectou o Drive (ou o 1º admin).
  const connection = await getDriveConnection();
  let profileId = (await admin.from("drive_connection").select("connected_by").eq("id", true).maybeSingle()).data?.connected_by ?? null;
  if (!profileId) profileId = (await admin.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle()).data?.id ?? null;
  if (!profileId || !connection) return NextResponse.json({ ok: false, note: "Sem administrador para registrar a sincronização." });

  const started = new Date().toISOString();
  const summary = await syncAllClients(systemCtx(profileId), 50_000);

  await admin.from("drive_sync_runs").insert({
    started_at: started,
    finished_at: new Date().toISOString(),
    clients_synced: summary.clientsSynced,
    clients_pending: summary.clientsPending,
    imported: summary.imported,
    exported: summary.exported,
    failed: summary.failed,
    note: summary.errors.length ? summary.errors.slice(0, 5).join(" | ") : null,
  }); // melhor esforço: sem a migration 0010 só não guarda o histórico

  return NextResponse.json({ ok: true, purged, ...summary });
}
