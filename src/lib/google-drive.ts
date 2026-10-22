import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Integração com o Google Drive da conta do escritório (Maurício), autorizada
// uma única vez por OAuth. O refresh_token fica em drive_connection (tabela sem
// policies: só o service_role lê).
//
// Permissões (decisão do usuário, 2026-09-25):
//  - drive.readonly: LER o Drive todo → permite importar e sincronizar arquivos
//    que a equipe coloca à mão nas pastas dos clientes.
//  - drive.file: ESCREVER só no que o próprio portal cria (pasta "Clientes MC",
//    subpastas e arquivos exportados). O portal nunca altera nem apaga arquivos
//    que ele não criou.

export const DRIVE_ROOT_FOLDER_NAME = "Clientes MC";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const SCOPE_FILE = "https://www.googleapis.com/auth/drive.file";
const SCOPE_READONLY = "https://www.googleapis.com/auth/drive.readonly";
const SCOPES = [SCOPE_FILE, SCOPE_READONLY, "https://www.googleapis.com/auth/userinfo.email"];
const FOLDER_MIME = "application/vnd.google-apps.folder";
const NATIVE_PREFIX = "application/vnd.google-apps.";

export function isDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function driveRedirectUri(origin: string): string {
  return `${origin}/api/drive/callback`;
}

export function buildAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: driveRedirectUri(origin),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // Sem `prompt=consent` o Google só devolve refresh_token na primeira vez.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
  });
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(origin: string, code: string) {
  const tokens = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: driveRedirectUri(origin),
  });
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(tokens.error_description ?? tokens.error ?? "O Google não devolveu a autorização.");
  }

  const info = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const { email } = (await info.json()) as { email?: string };
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, email: email ?? "conta desconhecida" };
}

export type DriveConnection = {
  account_email: string;
  refresh_token: string;
  root_folder_id: string;
  connected_at: string;
};

export async function getDriveConnection(): Promise<DriveConnection | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("drive_connection")
    .select("account_email, refresh_token, root_folder_id, connected_at")
    .eq("id", true)
    .maybeSingle();
  return data;
}

async function accessTokenFor(connection: DriveConnection): Promise<{ token: string; scopes: string[] }> {
  const tokens = await postToken({ grant_type: "refresh_token", refresh_token: connection.refresh_token });
  if (!tokens.access_token) {
    // invalid_grant = autorização revogada/expirada: precisa reconectar.
    throw new Error(tokens.error_description ?? tokens.error ?? "Falha ao renovar o acesso ao Drive.");
  }
  return { token: tokens.access_token, scopes: (tokens.scope ?? "").split(/\s+/).filter(Boolean) };
}

async function driveFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Drive ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res;
}

// ---------- saúde da conexão (decide se os botões de sincronização aparecem)

export type DriveHealth =
  | { state: "not_configured" | "not_connected"; ok: false; canRead: false }
  | { state: "error"; ok: false; canRead: false; email: string; reason: string }
  | { state: "ok"; ok: true; canRead: boolean; email: string };

const HEALTH_TTL_MS = 60_000;
let healthCache: { at: number; value: DriveHealth } | null = null;

export function clearDriveHealthCache() {
  healthCache = null;
}

// Só é "ok" quando um teste real funciona: o refresh do token e uma chamada ao
// Drive. Se o acesso caiu ou foi revogado, os botões não aparecem.
export async function getDriveHealth(): Promise<DriveHealth> {
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.value;

  let value: DriveHealth;
  if (!isDriveConfigured()) {
    value = { state: "not_configured", ok: false, canRead: false };
  } else {
    const connection = await getDriveConnection().catch(() => null);
    if (!connection) {
      value = { state: "not_connected", ok: false, canRead: false };
    } else {
      try {
        const { token, scopes } = await accessTokenFor(connection);
        await driveFetch(token, `${DRIVE_API}/about?fields=user(emailAddress)`);
        value = {
          state: "ok",
          ok: true,
          canRead: scopes.includes(SCOPE_READONLY) || scopes.includes("https://www.googleapis.com/auth/drive"),
          email: connection.account_email,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Falha ao acessar o Drive.";
        value = { state: "error", ok: false, canRead: false, email: connection.account_email, reason };
      }
    }
  }
  healthCache = { at: Date.now(), value };
  return value;
}

// ---------- pastas e arquivos

export async function createFolder(token: string, name: string, parentId?: string): Promise<string> {
  const res = await driveFetch(token, `${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  return ((await res.json()) as { id: string }).id;
}

// Subpasta com esse nome dentro de parentId: reaproveita se já existe.
export async function ensureSubfolder(token: string, parentId: string, name: string): Promise<string> {
  const q = `'${parentId}' in parents and trashed=false and mimeType='${FOLDER_MIME}' and name='${name.replace(/'/g, "\\'")}'`;
  const res = await driveFetch(token, `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  const found = ((await res.json()) as { files?: { id: string }[] }).files?.[0]?.id;
  return found ?? (await createFolder(token, name, parentId));
}

// Pasta do cliente dentro de "Clientes MC". Criada no primeiro uso e
// guardada em clients.drive_folder_id pra não criar duplicada depois.
export async function ensureClientFolder(
  token: string,
  connection: DriveConnection,
  client: { id: string; name: string }
): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("clients").select("drive_folder_id").eq("id", client.id).maybeSingle();
  if (data?.drive_folder_id) return data.drive_folder_id;

  // Nomes vindos de importações podem ter quebras de linha: normaliza pro Drive.
  const folderId = await createFolder(token, client.name.replace(/\s+/g, " ").trim() || "Cliente", connection.root_folder_id);
  await admin.from("clients").update({ drive_folder_id: folderId }).eq("id", client.id);
  return folderId;
}

export async function uploadBytes(
  token: string,
  /** converterPara: tipo nativo do Google (ex.: Google Docs) — o Drive converte na hora */
  args: { name: string; mimeType: string; bytes: Uint8Array; parentId: string; converterPara?: string }
): Promise<string> {
  const boundary = `mc-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: args.name, parents: [args.parentId], ...(args.converterPara ? { mimeType: args.converterPara } : {}) });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${
    args.mimeType || "application/octet-stream"
  }\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(head), Buffer.from(args.bytes), Buffer.from(tail)]);

  const res = await driveFetch(token, `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return ((await res.json()) as { id: string }).id;
}

/** Dá acesso de edição a uma pessoa (sem mandar e-mail do Google). */
export async function compartilharComEmail(token: string, fileId: string, email: string): Promise<void> {
  await driveFetch(token, `${DRIVE_API}/files/${fileId}/permissions?sendNotificationEmail=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
  });
}

export async function uploadFile(token: string, file: File, parentId: string): Promise<string> {
  return uploadBytes(token, {
    name: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
    parentId,
  });
}

// Subpastas chamadas "Interno" (ou "Internos", com ou sem acento/maiúscula) são
// PRIVADAS do escritório: a sincronização não entra nelas, então nada ali dentro
// vira documento do cliente (o cliente enxerga os documentos dele no portal).
export function isInternalFolder(name: string): boolean {
  const n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return n === "interno" || n === "internos";
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  webViewLink: string | null;
  path: string; // caminho relativo à pasta listada ("" = direto nela)
};

// Lista os arquivos de uma pasta (e das subpastas, até `maxDepth` níveis).
// Ignora pastas, atalhos e a lixeira. Requer drive.readonly pra enxergar o que
// a equipe colocou à mão.
export async function listFolderFiles(token: string, folderId: string, maxDepth = 3, maxFiles = Infinity): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  // Limite global de chamadas simultâneas ao Drive (as subpastas andam em paralelo).
  let active = 0;
  const waiting: (() => void)[] = [];
  async function limited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= 6) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  }
  async function walk(id: string, path: string, depth: number) {
    const subfolders: [string, string][] = [];
    let pageToken: string | undefined;
    do {
      if (out.length >= maxFiles) return;
      const q = `'${id}' in parents and trashed=false`;
      const url =
        `${DRIVE_API}/files?q=${encodeURIComponent(q)}&pageSize=200&orderBy=name` +
        `&fields=${encodeURIComponent("nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)")}` +
        (pageToken ? `&pageToken=${pageToken}` : "");
      const j = await limited(async () => (await (await driveFetch(token, url)).json()) as {
        nextPageToken?: string;
        files?: { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string }[];
      });
      for (const f of j.files ?? []) {
        if (out.length >= maxFiles) return;
        if (f.mimeType === FOLDER_MIME) {
          if (depth < maxDepth && !isInternalFolder(f.name)) subfolders.push([f.id, path ? `${path}/${f.name}` : f.name]);
        } else if (f.mimeType !== "application/vnd.google-apps.shortcut") {
          out.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size ? Number(f.size) : null,
            modifiedTime: f.modifiedTime ?? null,
            webViewLink: f.webViewLink ?? null,
            path,
          });
        }
      }
      pageToken = j.nextPageToken;
    } while (pageToken);
    // Subpastas em paralelo (no máx. 6 chamadas ao Drive por vez): uma a uma,
    // pastas grandes levavam minutos.
    await Promise.all(subfolders.map(([sid, spath]) => walk(sid, spath, depth + 1)));
  }
  await walk(folderId, "", 0);
  return out;
}

// Escapa aspas e barras para o texto de uma busca (parâmetro q) do Drive.
function escapeQuery(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export type DriveFolder = { id: string; name: string; modifiedTime: string | null };

// Navegação pelo Drive (assistente "Importar pastas"): pastas de um nível,
// "compartilhados comigo" ou busca por nome. Só pastas, sem lixeira.
export async function listFolders(
  token: string,
  opts: { parent?: string; shared?: boolean; query?: string }
): Promise<DriveFolder[]> {
  const parts = [`mimeType='${FOLDER_MIME}'`, "trashed=false"];
  if (opts.query) parts.push(`name contains '${escapeQuery(opts.query)}'`);
  else if (opts.shared) parts.push("sharedWithMe=true");
  else parts.push(`'${opts.parent && /^[A-Za-z0-9_-]+$/.test(opts.parent) ? opts.parent : "root"}' in parents`);

  const out: DriveFolder[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `${DRIVE_API}/files?q=${encodeURIComponent(parts.join(" and "))}&pageSize=200&orderBy=name` +
      `&fields=${encodeURIComponent("nextPageToken,files(id,name,modifiedTime)")}` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const res = await driveFetch(token, url);
    const j = (await res.json()) as { nextPageToken?: string; files?: { id: string; name: string; modifiedTime?: string }[] };
    for (const f of j.files ?? []) out.push({ id: f.id, name: f.name, modifiedTime: f.modifiedTime ?? null });
    pageToken = j.nextPageToken;
  } while (pageToken && out.length < 600);
  return out;
}

export async function getFolderMeta(token: string, id: string): Promise<{ id: string; name: string } | null> {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  try {
    const res = await driveFetch(token, `${DRIVE_API}/files/${id}?fields=id,name,mimeType,trashed`);
    const j = (await res.json()) as { id: string; name: string; mimeType: string; trashed?: boolean };
    return j.mimeType === FOLDER_MIME && !j.trashed ? { id: j.id, name: j.name } : null;
  } catch {
    return null;
  }
}

// Arquivos nativos do Google (Docs, Planilhas, Apresentações) não têm "conteúdo
// binário": são exportados como PDF na hora de abrir.
export async function downloadFile(token: string, fileId: string) {
  const meta = await driveFetch(token, `${DRIVE_API}/files/${fileId}?fields=name,mimeType`);
  const { name, mimeType } = (await meta.json()) as { name: string; mimeType: string };
  if (mimeType.startsWith(NATIVE_PREFIX) && mimeType !== FOLDER_MIME) {
    const media = await driveFetch(token, `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent("application/pdf")}`);
    return { name: name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`, mimeType: "application/pdf", stream: media.body };
  }
  const media = await driveFetch(token, `${DRIVE_API}/files/${fileId}?alt=media`);
  return { name, mimeType, stream: media.body };
}

// Existe e não está na lixeira? (usado pra avisar de arquivos removidos no Drive)
export async function driveFileExists(token: string, fileId: string): Promise<boolean> {
  try {
    const res = await driveFetch(token, `${DRIVE_API}/files/${fileId}?fields=trashed`);
    return !((await res.json()) as { trashed?: boolean }).trashed;
  } catch {
    return false;
  }
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  await driveFetch(token, `${DRIVE_API}/files/${fileId}`, { method: "DELETE" });
}

// Atalho pra quem só precisa do token da conexão atual (ou null se não há).
export async function getDriveSession(): Promise<{ token: string; connection: DriveConnection; canRead: boolean } | null> {
  const connection = await getDriveConnection();
  if (!connection) return null;
  const { token, scopes } = await accessTokenFor(connection);
  return {
    token,
    connection,
    canRead: scopes.includes(SCOPE_READONLY) || scopes.includes("https://www.googleapis.com/auth/drive"),
  };
}

// Busca arquivos no Drive conectado (usado pelo assistente do portal).
// `conteudo: true` procura também no texto de dentro dos arquivos (fullText).
export async function searchDriveFiles(
  token: string,
  termo: string,
  opts: { conteudo?: boolean; max?: number } = {}
): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string | null; webViewLink: string | null }[]> {
  const t = termo.replace(/\\/g, "\\\\").replace(/'/g, "\\'").trim();
  const filtroTexto = t ? (opts.conteudo ? `(name contains '${t}' or fullText contains '${t}')` : `name contains '${t}'`) : "";
  const q = [filtroTexto, "trashed=false", `mimeType != '${FOLDER_MIME}'`].filter(Boolean).join(" and ");
  const url =
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&pageSize=${Math.min(opts.max ?? 20, 50)}&orderBy=${encodeURIComponent("modifiedTime desc")}` +
    `&fields=${encodeURIComponent("files(id,name,mimeType,modifiedTime,webViewLink)")}`;
  const j = (await (await driveFetch(token, url)).json()) as {
    files?: { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string }[];
  };
  return (j.files ?? []).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime ?? null, webViewLink: f.webViewLink ?? null }));
}

/** Nome e tipo de um arquivo do Drive. */
export async function getDriveFileMeta(token: string, fileId: string): Promise<{ name: string; mimeType: string } | null> {
  try {
    const r = await driveFetch(token, `${DRIVE_API}/files/${fileId}?fields=name,mimeType`);
    return (await r.json()) as { name: string; mimeType: string };
  } catch {
    return null;
  }
}
