import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarZapsign } from "@/lib/atas/zapsign";

// Webhook da ZapSign (cadastrar em Configurações > Integrações > Webhooks com
// https://mcadvogados.app.br/api/zapsign/webhook?chave=<ZAPSIGN_WEBHOOK_CHAVE>).
// Não confia no conteúdo do aviso: só usa o token/external_id para achar a ata
// e consulta a ZapSign de novo. Responde 200 sempre (senão eles reenviam).
export const maxDuration = 60;

function chaveConfere(recebida: string | null): boolean {
  const certa = process.env.ZAPSIGN_WEBHOOK_CHAVE;
  if (!certa || !recebida) return false;
  const a = Buffer.from(certa);
  const b = Buffer.from(recebida);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!chaveConfere(req.headers.get("x-zapsign-chave") ?? new URL(req.url).searchParams.get("chave"))) return NextResponse.json({ ok: false }, { status: 401 });
  const corpo = (await req.json().catch(() => ({}))) as { token?: string; external_id?: string; doc?: { token?: string; external_id?: string } };
  const token = corpo.token ?? corpo.doc?.token ?? null;
  const externo = corpo.external_id ?? corpo.doc?.external_id ?? null;
  const db = createAdminClient() as unknown as SupabaseClient;
  let q = db.from("atas").select("id").eq("assinatura_via", "zapsign").limit(1);
  if (token) q = q.eq("zapsign_token", token);
  else if (externo && /^[0-9a-f-]{36}$/i.test(externo)) q = q.eq("id", externo);
  else return NextResponse.json({ ok: true, ignorado: true });
  const { data } = await q;
  if (data?.[0]) await sincronizarZapsign(data[0].id).catch((e) => console.error("webhook ZapSign:", e instanceof Error ? e.message : e));
  return NextResponse.json({ ok: true });
}
