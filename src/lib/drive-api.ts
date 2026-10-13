import "server-only";
import { NextResponse } from "next/server";
import { getProfile } from "@/lib/dal";

// Guarda comum das rotas /api/drive/*: só equipe (admin/advogado) logada.
export async function requireStaff(adminOnly = false) {
  const profile = await getProfile();
  if (!profile) return { error: NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 }) };
  const allowed = adminOnly ? ["admin"] : ["admin", "advogado"];
  if (!allowed.includes(profile.role)) return { error: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { profile };
}

// Mensagem de erro amigável (o detalhe técnico vai só pro log do servidor).
export function driveError(e: unknown, context: string) {
  console.error(`Drive (${context}):`, e);
  const msg = e instanceof Error ? e.message : "";
  let text = "Não foi possível falar com o Google Drive. Tente novamente.";
  if (/invalid_grant|revoked|expired/i.test(msg)) text = "A autorização do Google Drive expirou. Reconecte em Integrações.";
  else if (/insufficient|scope|ACCESS_TOKEN_SCOPE/i.test(msg)) text = "Falta permissão no Drive. Reconecte em Integrações para liberar a leitura.";
  else if (/has not been used|is disabled/i.test(msg)) text = "A API do Google Drive está desativada no Google Cloud.";
  else if (msg && !/^Drive \d+:/.test(msg) && msg.length < 160) text = msg;
  return NextResponse.json({ error: text }, { status: 502 });
}
