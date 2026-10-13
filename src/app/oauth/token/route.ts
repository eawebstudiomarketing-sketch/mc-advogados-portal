import { issueTokens, mcpDb, pkceMatches, sha } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

const err = (error: string, description?: string, status = 400) =>
  Response.json({ error, error_description: description }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return err("invalid_request");
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const db = mcpDb();
  const grant = get("grant_type");
  const clientId = get("client_id");
  if (!clientId) return err("invalid_client", "client_id ausente", 401);

  if (grant === "authorization_code") {
    const codeHash = sha(get("code"));
    // Código de uso único: apaga antes de conferir o resto.
    const { data: row } = await db.from("mcp_oauth_codes").delete().eq("code_hash", codeHash).select("*").maybeSingle();
    if (!row || row.client_id !== clientId) return err("invalid_grant", "código inválido");
    if (new Date(row.expires_at).getTime() < Date.now()) return err("invalid_grant", "código expirado");
    if (row.redirect_uri !== get("redirect_uri")) return err("invalid_grant", "redirect_uri diferente");
    if (!get("code_verifier") || !pkceMatches(get("code_verifier"), row.code_challenge)) return err("invalid_grant", "PKCE inválido");
    return Response.json(await issueTokens(clientId, row.profile_id), { headers: { "Cache-Control": "no-store" } });
  }

  if (grant === "refresh_token") {
    // Refresh token de uso único (rotação): o antigo é apagado ao usar.
    const { data: row } = await db.from("mcp_oauth_tokens").delete().eq("refresh_hash", sha(get("refresh_token"))).select("*").maybeSingle();
    if (!row || row.client_id !== clientId || row.revoked) return err("invalid_grant", "refresh token inválido");
    if (new Date(row.refresh_expires_at).getTime() < Date.now()) return err("invalid_grant", "refresh token expirado");
    return Response.json(await issueTokens(clientId, row.profile_id), { headers: { "Cache-Control": "no-store" } });
  }

  return err("unsupported_grant_type");
}
