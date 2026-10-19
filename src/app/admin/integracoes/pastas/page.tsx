import Link from "next/link";
import { exigirPermissao } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDriveHealth, getDriveSession, getFolderMeta } from "@/lib/google-drive";
import { FolderLinkTable, type ClientRowData } from "@/components/drive/folder-link-table";

function clean(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

function whenText(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const tz = "America/Bahia";
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: tz, ...o }).format(d);
  return `${f({ day: "2-digit", month: "2-digit" })} às ${f({ hour: "2-digit", minute: "2-digit" })}`;
}

export default async function PastasPage() {
  await exigirPermissao("integracoes");
  const health = await getDriveHealth();
  const admin = createAdminClient();

  let body: React.ReactNode;

  if (!health.ok) {
    body = (
      <p className="ui-card px-4 py-4 text-sm text-foreground/70">
        O Google Drive precisa estar conectado e funcionando para ligar pastas.{" "}
        <Link href="/admin/integracoes" className="font-medium text-navy underline">
          Ir para Integrações
        </Link>
        .
      </p>
    );
  } else if (!health.canRead) {
    body = (
      <p className="rounded-xl border border-status-pending px-4 py-4 text-sm text-status-pending">
        Falta a permissão de <strong>leitura</strong> do Drive para ligar pastas que já existem.{" "}
        <a href="/api/drive/connect" className="font-medium underline">
          Reconectar o Drive
        </a>{" "}
        e aceitar a permissão nova.
      </p>
    );
  } else {
    // clientes (tolerante às migrations 0009/0010 ainda não aplicadas)
    const full = await admin.from("clients").select("id, name, drive_import_folder_ids, drive_last_sync_at").order("name");
    const basic = full.error ? await admin.from("clients").select("id, name").order("name") : null;
    const clients = (full.data ?? (basic?.data ?? []).map((c) => ({ ...c, drive_import_folder_ids: [] as string[], drive_last_sync_at: null as string | null }))) as {
      id: string;
      name: string;
      drive_import_folder_ids: string[];
      drive_last_sync_at: string | null;
    }[];

    // paginado: sem .range() o banco devolve no máx. 1000 linhas
    const docCount = new Map<string, number>();
    for (let from = 0; ; from += 1000) {
      const { data: docs } = await admin.from("documents").select("client_id").not("drive_file_id", "is", null).order("id").range(from, from + 999);
      for (const d of docs ?? []) docCount.set(d.client_id, (docCount.get(d.client_id) ?? 0) + 1);
      if ((docs ?? []).length < 1000) break;
    }

    // nomes das pastas ligadas (uma consulta por pasta distinta)
    const session = await getDriveSession().catch(() => null);
    const ids = [...new Set(clients.flatMap((c) => c.drive_import_folder_ids ?? []))];
    const names = new Map<string, string>();
    if (session) {
      await Promise.all(
        ids.map(async (id) => {
          const meta = await getFolderMeta(session.token, id);
          names.set(id, meta?.name ?? "(pasta inacessível)");
        })
      );
    }

    const rows: ClientRowData[] = clients.map((c) => ({
      id: c.id,
      name: clean(c.name),
      linked: (c.drive_import_folder_ids ?? []).map((id) => ({ id, name: names.get(id) ?? "(pasta)" })),
      driveDocs: docCount.get(c.id) ?? 0,
      lastSync: whenText(c.drive_last_sync_at),
    }));

    let lastRun: string | null = null;
    try {
      const { data: run } = await admin.from("drive_sync_runs").select("started_at, imported, exported, failed, clients_pending").order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (run) {
        lastRun = `${whenText(run.started_at)} — ${run.imported} novo(s) do Drive, ${run.exported} enviado(s)${run.failed ? `, ${run.failed} com erro` : ""}${run.clients_pending ? `, ${run.clients_pending} cliente(s) ficaram para a próxima rodada` : ""}`;
      }
    } catch {
      /* migration 0010 ainda não aplicada */
    }

    body = (
      <>
        <p className="text-sm text-muted">
          Cada cliente tem uma pasta no Drive criada pelo portal em <strong>Clientes MC</strong>. Se o cliente já tinha uma pasta no
          Drive, ligue-a aqui: o portal passa a trazer os arquivos dela. Você só faz isso uma vez. Subpastas chamadas{" "}
          <strong>Interno</strong> (em qualquer pasta do cliente) nunca são trazidas: use-as para o que o cliente não deve ver.
        </p>
        <p className="text-xs text-muted">
          Rodada automática da madrugada: {lastRun ?? "ainda não rodou"}.
        </p>
        <FolderLinkTable rows={rows} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/integracoes" className="ui-link">
          ← Integrações
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-navy">Pastas dos clientes</h1>
        <p className="text-sm text-muted">Ligue as pastas que já existem no Google Drive ao cliente certo.</p>
      </div>
      {body}
    </div>
  );
}
