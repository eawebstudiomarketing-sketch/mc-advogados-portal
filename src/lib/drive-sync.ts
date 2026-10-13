import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  driveFileExists,
  ensureClientFolder,
  ensureSubfolder,
  getDriveSession,
  getFolderMeta,
  listFolderFiles,
  listFolders,
  uploadBytes,
  type DriveFile,
} from "@/lib/google-drive";
import { trashDocuments } from "@/lib/trash";
import type { Database } from "@/lib/supabase/types";

type Category = Database["public"]["Enums"]["document_category"];
type Db = SupabaseClient<Database>;

// Sincronização entre o portal e o Google Drive — uma ideia só:
//   "os arquivos do cliente vivem no Drive; o portal mostra e organiza".
// Sincronizar um cliente = trazer tudo que é novo nas pastas dele (a que o portal
// criou + as que a equipe ligou à mão) + mandar pro Drive o que ainda está só no
// portal + avisar de arquivos que sumiram do Drive. Nunca apaga nada, e trazer
// NÃO copia o arquivo: o documento passa a apontar pro Drive.

export type Ctx = { db: Db; profileId: string };

// Contexto de um usuário logado (respeita as regras de acesso do banco).
export async function userCtx(profileId: string): Promise<Ctx> {
  return { db: (await createClient()) as unknown as Db, profileId };
}
// Contexto do servidor (rodada automática, sem ninguém logado).
export function systemCtx(profileId: string): Ctx {
  return { db: createAdminClient(), profileId };
}

async function requireSession(needRead = false) {
  const session = await getDriveSession();
  if (!session) throw new Error("O Google Drive não está conectado.");
  if (needRead && !session.canRead) {
    throw new Error("Falta a permissão de leitura do Drive. Reconecte o Drive em Integrações.");
  }
  return session;
}
type Session = Awaited<ReturnType<typeof requireSession>>;

type ClientRow = { id: string; name: string; drive_import_folder_ids: string[] };

async function clientOf(clientId: string): Promise<ClientRow> {
  const admin = createAdminClient();
  const full = await admin.from("clients").select("id, name, drive_import_folder_ids").eq("id", clientId).maybeSingle();
  if (full.data) return full.data;
  // Migration 0009 ainda não aplicada: segue sem as pastas ligadas à mão.
  const basic = await admin.from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!basic.data) throw new Error("Cliente não encontrado.");
  return { ...basic.data, drive_import_folder_ids: [] };
}

function fileNameFor(title: string, path: string): string {
  const ext = path.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "";
  return ext && !title.toLowerCase().endsWith(ext.toLowerCase()) ? `${title}${ext}` : title;
}

function plain(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Categoria sugerida pelo nome do arquivo; o que não der pra saber vira "outros".
export function guessCategory(fileName: string): Category {
  const n = plain(fileName);
  if (/\b(rg|cpf|cnh|identidade|passaporte|certidao|residencia|titulo de eleitor|carteira de trabalho|ctps)\b/.test(n)) return "pessoal";
  if (/(boleto|comprovante|nota fiscal|\bnf\b|recibo|fatura|pagamento|extrato|darf|imposto|guia de|honorario.*(pag|recib))/.test(n)) return "financeiro";
  if (/(peticao|processo|sentenca|recurso|audiencia|intimacao|inicial|contestacao|mandado|despacho|decisao|procuracao|acordao|embargo|replica)/.test(n)) return "processo";
  if (/(contrato|honorario|aditivo|proposta|termo de|distrato)/.test(n)) return "contrato";
  return "outros";
}

// ---------- nomes: sugestão de pasta por cliente

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "pasta", "cliente", "clientes", "adv", "ltda", "me", "epp", "sa", "docs", "documentos", "arquivos"]);
function tokens(s: string): string[] {
  return [
    ...new Set(
      plain(s)
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1 && !STOP.has(t))
    ),
  ];
}
function nameScore(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const inter = ta.filter((t) => tb.includes(t)).length;
  if (inter === 0) return 0;
  return Math.min(1, (inter / Math.min(ta.length, tb.length)) * 0.7 + (inter / new Set([...ta, ...tb]).size) * 0.3);
}
export function suggestClient(folderName: string, clients: { id: string; name: string }[]) {
  let best: { id: string; name: string; score: number } | null = null;
  for (const c of clients) {
    const score = nameScore(folderName, c.name);
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, name: c.name, score };
  }
  return best && best.score >= 0.5 ? best : null;
}

// ---------- pastas do cliente (a do portal + as ligadas à mão)

async function allClientFiles(session: Session, client: ClientRow) {
  const own = await ensureClientFolder(session.token, session.connection, { id: client.id, name: client.name });
  const seen = new Map<string, DriveFile>();
  for (const folderId of [own, ...(client.drive_import_folder_ids ?? [])]) {
    try {
      for (const f of await listFolderFiles(session.token, folderId)) if (!seen.has(f.id)) seen.set(f.id, f);
    } catch (e) {
      // Pasta ligada que foi apagada/perdeu acesso: não derruba o cliente todo.
      if (folderId === own) throw e;
      console.error(`Drive: pasta ligada ${folderId} inacessível`, e);
    }
  }
  return [...seen.values()];
}

// Documentos do cliente que apontam pro Drive. Paginado: sem .range() o
// PostgREST devolve no máximo 1000 linhas e o resto some calado.
async function driveDocs(db: Db, clientId: string): Promise<{ id: string; drive_file_id: string }[]> {
  const out: { id: string; drive_file_id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("documents")
      .select("id, drive_file_id")
      .eq("client_id", clientId)
      .not("drive_file_id", "is", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error("Não foi possível ler os documentos do cliente.");
    for (const d of data ?? []) out.push({ id: d.id, drive_file_id: d.drive_file_id as string });
    if ((data ?? []).length < 1000) return out;
  }
}

async function registeredDriveIds(db: Db, clientId: string): Promise<Set<string>> {
  return new Set((await driveDocs(db, clientId)).map((d) => d.drive_file_id));
}

// ---------- SINCRONIZAR UM CLIENTE

export type SyncResult = {
  imported: number;
  exported: number;
  failed: { id: string; error: string }[];
  missingInDrive: number;
  canRead: boolean;
};

export async function syncClient(ctx: Ctx, clientId: string): Promise<SyncResult> {
  const session = await requireSession();
  const client = await clientOf(clientId);
  const failed: SyncResult["failed"] = [];

  // 1) trazer o que é novo no Drive (categoria pelo nome do arquivo)
  let imported = 0;
  if (session.canRead) {
    const files = await allClientFiles(session, client);
    const registered = await registeredDriveIds(ctx.db, clientId);
    const rows: Database["public"]["Tables"]["documents"]["Insert"][] = files
      .filter((f) => !registered.has(f.id))
      .map((f) => ({
        client_id: clientId,
        uploaded_by: ctx.profileId,
        category: guessCategory(f.name),
        title: f.name,
        file_path: `drive/${f.id}`,
        drive_file_id: f.id,
      }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await ctx.db.from("documents").insert(rows.slice(i, i + 200));
      if (error) throw new Error("Não foi possível registrar os arquivos trazidos do Drive.");
      imported += Math.min(200, rows.length - i);
    }
  }

  // 2) mandar pro Drive o que ainda está só no portal
  // ATAs ficam só no portal (pasta interna), não vão para o Drive.
  const { data: pending } = await ctx.db
    .from("documents")
    .select("id")
    .eq("client_id", clientId)
    .is("drive_file_id", null)
    .neq("category", "ata");
  const exp = await exportDocuments(ctx, (pending ?? []).map((d) => d.id));
  failed.push(...exp.failed);
  let exported = exp.exported;

  // 3) PDFs de relatório/onboarding que ainda não foram pro Drive
  for (const kind of ["reports", "onboarding"] as const) {
    const r = await exportPendingPdfs(ctx, kind, clientId);
    exported += r.exported;
    failed.push(...r.failed);
  }

  // 4) avisar (sem apagar nada) de documentos que apontam pra arquivo removido/na lixeira
  let missing = 0;
  if (session.canRead) {
    const { data: linked } = await ctx.db.from("documents").select("drive_file_id").eq("client_id", clientId).not("drive_file_id", "is", null).limit(60);
    for (const d of linked ?? []) if (!(await driveFileExists(session.token, d.drive_file_id as string))) missing++;
  }

  await createAdminClient().from("clients").update({ drive_last_sync_at: new Date().toISOString() }).eq("id", clientId); // melhor esforço
  return { imported, exported, failed, missingInDrive: missing, canRead: session.canRead };
}

// ---------- RODADA AUTOMÁTICA (todos os clientes, com limite de tempo)

export type RunSummary = { clientsSynced: number; clientsPending: number; imported: number; exported: number; failed: number; errors: string[] };

export async function syncAllClients(ctx: Ctx, budgetMs: number): Promise<RunSummary> {
  const started = Date.now();
  const admin = createAdminClient();
  // começa pelos clientes sincronizados há mais tempo (nunca sincronizados primeiro)
  const order = await admin.from("clients").select("id, name").order("drive_last_sync_at", { ascending: true, nullsFirst: true });
  const list = order.data ?? (await admin.from("clients").select("id, name")).data ?? [];

  const sum: RunSummary = { clientsSynced: 0, clientsPending: 0, imported: 0, exported: 0, failed: 0, errors: [] };
  for (let i = 0; i < list.length; i++) {
    if (Date.now() - started > budgetMs) {
      sum.clientsPending = list.length - i;
      break;
    }
    try {
      const r = await syncClient(ctx, list[i].id);
      sum.clientsSynced++;
      sum.imported += r.imported;
      sum.exported += r.exported;
      sum.failed += r.failed.length;
    } catch (e) {
      sum.failed++;
      sum.errors.push(`${list[i].name}: ${e instanceof Error ? e.message.slice(0, 120) : "erro"}`);
    }
  }
  return sum;
}

// ---------- LIGAR / DESLIGAR PASTAS EXISTENTES DO DRIVE A UM CLIENTE (só admin)

const MAX_LINKED_FOLDERS = 10;

export async function linkFolder(ctx: Ctx, clientId: string, folderId: string): Promise<{ folderName: string } & SyncResult> {
  const session = await requireSession(true);
  const meta = await getFolderMeta(session.token, folderId);
  if (!meta) throw new Error("A pasta não foi encontrada no Drive.");
  const client = await clientOf(clientId);

  const current = client.drive_import_folder_ids ?? [];
  if (!current.includes(folderId)) {
    if (current.length >= MAX_LINKED_FOLDERS) throw new Error(`Cada cliente pode ter até ${MAX_LINKED_FOLDERS} pastas ligadas.`);
    const { error } = await createAdminClient()
      .from("clients")
      .update({ drive_import_folder_ids: [...current, folderId] })
      .eq("id", clientId);
    if (error) throw new Error("Não foi possível ligar a pasta ao cliente. Rode a migration 0009.");
  }
  return { folderName: meta.name, ...(await syncClient(ctx, clientId)) };
}

// Desligar a pasta do cliente. Por padrão NÃO apaga nada: os documentos que já
// vieram dela continuam no portal. Com removeDocuments, remove do PORTAL os
// documentos que vieram dessa pasta (só os registros — os arquivos no Drive nunca
// são tocados). Não remove o que veio da pasta própria do cliente em "Clientes MC".
// dryRun só conta quantos seriam removidos, sem mudar nada.
export async function unlinkFolder(
  clientId: string,
  folderId: string,
  opts: { removeDocuments?: boolean; dryRun?: boolean; by?: string | null; folderName?: string } = {}
): Promise<{ removable: number; removed: number; batchId: string | null }> {
  const client = await clientOf(clientId);
  const admin = createAdminClient();
  let removable = 0;
  let removed = 0;
  let batchId: string | null = null;

  if (opts.removeDocuments || opts.dryRun) {
    const session = await requireSession(true);
    // A pasta ligada e a pasta própria (Clientes MC/<cliente>) são lidas em
    // paralelo; a própria só é lida se já existe (não cria pasta só pra contar).
    const { data: ownRow } = await admin.from("clients").select("drive_folder_id").eq("id", clientId).maybeSingle();
    const ownFolder = ownRow?.drive_folder_id ?? null;
    const [folderFiles, ownFileList, docs] = await Promise.all([
      listFolderFiles(session.token, folderId).catch(() => {
        throw new Error("Não consegui ler a pasta no Drive para saber quais documentos vieram dela. Você ainda pode só desligá-la.");
      }),
      ownFolder ? listFolderFiles(session.token, ownFolder).catch(() => []) : Promise.resolve([]),
      driveDocs(admin, clientId),
    ]);
    const fromFolder = new Set(folderFiles.map((f) => f.id));
    const ownFiles = new Set(ownFileList.map((f) => f.id));
    const ids = docs.filter((d) => fromFolder.has(d.drive_file_id) && !ownFiles.has(d.drive_file_id)).map((d) => d.id);
    removable = ids.length;

    if (opts.removeDocuments && !opts.dryRun) {
      // Vão todos pra lixeira como UM lote (restaurável por 30 dias, religa a pasta).
      const name = (opts.folderName ?? "").trim() || "sem nome";
      const r = await trashDocuments(ids, `Pasta "${name}" desligada de ${client.name.replace(/\s+/g, " ").trim()}`, opts.by ?? null, {
        relink_client_id: clientId,
        relink_folder_id: folderId,
      });
      removed = r.removed;
      batchId = r.batchId;
    }
  }

  if (!opts.dryRun) {
    await admin
      .from("clients")
      .update({ drive_import_folder_ids: (client.drive_import_folder_ids ?? []).filter((f) => f !== folderId) })
      .eq("id", clientId);
  }
  return { removable, removed, batchId };
}

export type FolderSuggestion = { clientId: string; folderId: string; folderName: string; score: number };

// Para cada cliente SEM pasta ligada, procura no Drive uma pasta com nome
// parecido. Não liga nada: só sugere.
export async function suggestFolders(): Promise<FolderSuggestion[]> {
  const session = await requireSession(true);
  const admin = createAdminClient();
  const { data: rows } = await admin.from("clients").select("id, name, drive_folder_id, drive_import_folder_ids").order("name");
  const clients = rows ?? [];
  const taken = new Set<string>([session.connection.root_folder_id]);
  for (const c of clients) {
    if (c.drive_folder_id) taken.add(c.drive_folder_id);
    for (const f of c.drive_import_folder_ids ?? []) taken.add(f);
  }

  const out: FolderSuggestion[] = [];
  for (const c of clients) {
    if ((c.drive_import_folder_ids ?? []).length > 0) continue;
    // a palavra mais distintiva do nome (a maior) é o filtro da busca no Drive
    const key = tokens(c.name).sort((a, b) => b.length - a.length)[0];
    if (!key || key.length < 3) continue;
    try {
      const found = await listFolders(session.token, { query: key });
      let best: FolderSuggestion | null = null;
      for (const f of found) {
        if (taken.has(f.id)) continue;
        const score = nameScore(f.name, c.name);
        if (score >= 0.5 && (!best || score > best.score)) best = { clientId: c.id, folderId: f.id, folderName: f.name, score: Math.round(score * 100) / 100 };
      }
      if (best) out.push(best);
    } catch (e) {
      console.error(`Drive: busca de sugestão falhou (${c.name})`, e);
    }
  }
  return out;
}

// ---------- ENVIAR PRO DRIVE (interno: a sincronização e a geração de PDFs usam)

export type ExportResult = { exported: number; failed: { id: string; error: string }[] };

async function readStorage(path: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const { data, error } = await createAdminClient().storage.from("documents").download(path);
  if (error || !data) throw new Error("arquivo não encontrado no armazenamento");
  return { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: data.type };
}

// Copia do armazenamento do portal pro Drive; o documento passa a apontar pro
// Drive e a cópia antiga é MANTIDA (legacy_file_path).
async function exportDocuments(ctx: Ctx, ids: string[]): Promise<ExportResult> {
  const result: ExportResult = { exported: 0, failed: [] };
  if (ids.length === 0) return result;
  const session = await requireSession();
  const { data: docs } = await ctx.db.from("documents").select("id, title, file_path, client_id").in("id", ids).is("drive_file_id", null);

  for (const d of docs ?? []) {
    try {
      const client = await clientOf(d.client_id);
      const folderId = await ensureClientFolder(session.token, session.connection, { id: client.id, name: client.name });
      const { bytes, mimeType } = await readStorage(d.file_path);
      const driveId = await uploadBytes(session.token, { name: fileNameFor(d.title, d.file_path), mimeType, bytes, parentId: folderId });
      const { error } = await ctx.db
        .from("documents")
        .update({ drive_file_id: driveId, legacy_file_path: d.file_path, file_path: `drive/${driveId}` })
        .eq("id", d.id);
      if (error) throw new Error("não foi possível atualizar o registro");
      result.exported++;
    } catch (e) {
      result.failed.push({ id: d.id, error: e instanceof Error ? e.message : "erro" });
    }
  }
  return result;
}

// PDFs gerados pelo portal (relatório mensal / onboarding) que ainda não estão no Drive.
async function exportPendingPdfs(ctx: Ctx, kind: "reports" | "onboarding", clientId: string): Promise<ExportResult> {
  const result: ExportResult = { exported: 0, failed: [] };
  const table = kind === "reports" ? "monthly_reports" : "onboardings";
  const subfolder = kind === "reports" ? "Relatórios" : "Onboarding";
  const { data: rows, error: qerr } = await ctx.db.from(table).select("*").eq("client_id", clientId).not("pdf_url", "is", null).is("drive_file_id", null);
  if (qerr || !rows || rows.length === 0) return result; // sem coluna (migration 0008) ou nada pendente

  const session = await requireSession();
  for (const r of rows as unknown as { id: string; client_id: string; pdf_url: string; reference_month?: number; reference_year?: number; created_at: string }[]) {
    try {
      const client = await clientOf(r.client_id);
      const clientFolder = await ensureClientFolder(session.token, session.connection, { id: client.id, name: client.name });
      const parent = await ensureSubfolder(session.token, clientFolder, subfolder);
      const { bytes } = await readStorage(r.pdf_url);
      const clean = client.name.replace(/\s+/g, " ").trim();
      const name =
        kind === "reports"
          ? `Relatório ${r.reference_year}-${String(r.reference_month).padStart(2, "0")} - ${clean}.pdf`
          : `Onboarding ${r.created_at.slice(0, 10)} - ${clean}.pdf`;
      const driveId = await uploadBytes(session.token, { name, mimeType: "application/pdf", bytes, parentId: parent });
      const { error } = await ctx.db.from(table).update({ drive_file_id: driveId }).eq("id", r.id);
      if (error) throw new Error("não foi possível atualizar o registro");
      result.exported++;
    } catch (e) {
      result.failed.push({ id: r.id, error: e instanceof Error ? e.message : "erro" });
    }
  }
  return result;
}

// Chamado logo depois de gerar um relatório/onboarding: manda o PDF pro Drive
// sem ninguém precisar clicar. Nunca quebra a geração: se o Drive estiver fora,
// a rodada automática da madrugada manda depois.
export async function autoExportPdf(profileId: string, kind: "reports" | "onboarding", clientId: string): Promise<void> {
  try {
    if (!(await getDriveSession())) return;
    await exportPendingPdfs(systemCtx(profileId), kind, clientId);
  } catch (e) {
    console.error("Drive: exportação automática do PDF falhou (a rodada da madrugada tenta de novo)", e);
  }
}
