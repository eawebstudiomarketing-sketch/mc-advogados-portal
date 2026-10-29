import { mcpDb, newSecret, validRedirectUri } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

// Registro dinâmico de cliente (RFC 7591): o Claude se registra sozinho.
// Só guarda nome e redirect URIs; quem de fato autoriza é uma pessoa da equipe
// logada no portal, na tela de consentimento.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { client_name?: unknown; redirect_uris?: unknown } | null;
  const uris = body?.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(validRedirectUri)) {
    return Response.json({ error: "invalid_redirect_uri", error_description: "redirect_uris inválidos" }, { status: 400 });
  }
  // limite global (o endpoint é público): evita encher a tabela
  const { count: recentes } = await mcpDb().from("mcp_oauth_clients").select("client_id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((recentes ?? 0) >= 30) return Response.json({ error: "temporarily_unavailable" }, { status: 429, headers: { "Retry-After": "600" } });
  const clientId = newSecret("mcpc");
  const name = typeof body?.client_name === "string" ? body.client_name.replace(/[<>]/g, " ").replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) || null : null;
  const { error } = await mcpDb().from("mcp_oauth_clients").insert({ client_id: clientId, client_name: name, redirect_uris: uris });
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  return Response.json(
    {
      client_id: clientId,
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 }
  );
}
