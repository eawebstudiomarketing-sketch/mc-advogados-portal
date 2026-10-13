import { NextResponse } from "next/server";
import { getProfile } from "@/lib/dal";
import { CODE_TTL_MS, mcpDb, newSecret, redirectAllowed, sha } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

// Recebe o "Permitir/Cancelar" da tela de consentimento, revalida tudo e devolve
// o código de autorização para o Claude.
export async function POST(request: Request) {
  const form = await request.formData();
  const get = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");

  const profile = await getProfile();
  if (!profile || profile.role === "client") return new Response("Não autorizado", { status: 403 });

  const db = mcpDb();
  const { data: client } = await db.from("mcp_oauth_clients").select("redirect_uris").eq("client_id", clientId).maybeSingle();
  if (!client || !redirectAllowed(client.redirect_uris, redirectUri) || !get("code_challenge")) {
    return new Response("Pedido inválido", { status: 400 });
  }

  const target = new URL(redirectUri);
  if (get("state")) target.searchParams.set("state", get("state"));

  if (get("decision") !== "allow") {
    target.searchParams.set("error", "access_denied");
    return NextResponse.redirect(target, 303);
  }

  const code = newSecret("mcpk");
  const { error } = await db.from("mcp_oauth_codes").insert({
    code_hash: sha(code),
    client_id: clientId,
    profile_id: profile.id,
    redirect_uri: redirectUri,
    code_challenge: get("code_challenge"),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) return new Response("Erro ao gerar autorização", { status: 500 });

  target.searchParams.set("code", code);
  return NextResponse.redirect(target, 303);
}
