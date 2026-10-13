import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// As tabelas do MCP não estão em types.ts (são só da service_role), então o
// cliente aqui é sem tipos.
export function mcpDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export const sha = (v: string) => createHash("sha256").update(v).digest("hex");
export const newSecret = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

const ACCESS_TTL_MS = 60 * 60 * 1000; // 1 h
const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 dias
export const CODE_TTL_MS = 5 * 60 * 1000;

export type McpIdentity = { profileId: string; fullName: string; role: string };

export function unauthorized(description = "Token ausente ou inválido") {
  return new Response(JSON.stringify({ error: "invalid_token", error_description: description }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${siteUrl()}/.well-known/oauth-protected-resource"`,
    },
  });
}

// Confere o Bearer token. Só equipe (admin/advogado) passa — mesmo que um token
// tenha sido emitido antes de o perfil mudar de papel.
export async function verifyBearer(request: Request): Promise<McpIdentity | null> {
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return null;
  const db = mcpDb();
  const { data: tok } = await db
    .from("mcp_oauth_tokens")
    .select("profile_id, access_expires_at, revoked")
    .eq("access_hash", sha(m[1]))
    .maybeSingle();
  if (!tok || tok.revoked || new Date(tok.access_expires_at).getTime() < Date.now()) return null;
  const { data: profile } = await db.from("profiles").select("id, full_name, role").eq("id", tok.profile_id).maybeSingle();
  // Só admin: as ferramentas do MCP usam a chave de serviço e não seguem a
  // divisão de clientes por advogado.
  if (!profile || profile.role !== "admin") return null;
  return { profileId: profile.id, fullName: profile.full_name, role: profile.role };
}

export async function issueTokens(clientId: string, profileId: string) {
  const access = newSecret("mcpa");
  const refresh = newSecret("mcpr");
  const now = Date.now();
  const { error } = await mcpDb().from("mcp_oauth_tokens").insert({
    access_hash: sha(access),
    refresh_hash: sha(refresh),
    client_id: clientId,
    profile_id: profileId,
    access_expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
  });
  if (error) throw error;
  return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000 };
}

export function pkceMatches(verifier: string, challenge: string) {
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

export function redirectAllowed(registered: string[], uri: string) {
  return registered.includes(uri);
}

// Redirects aceitos no registro: https, ou http só em localhost (Claude Code / testes).
export function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string") return false;
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}
