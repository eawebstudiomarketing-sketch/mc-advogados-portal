import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { executarTranscricao } from "@/lib/transcricao";
import type { ModoTranscricao, OpcoesTranscricao } from "@/lib/transcricao-formato";

// Depois que o navegador mandou o arquivo pro servidor de mídia: transcreve
// (trechos em paralelo), guarda o texto e apaga o áudio. Até 5 min.
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "advogado"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Transcrição inválida." }, { status: 400 });
  const corpo = (await request.json().catch(() => ({}))) as { duracao?: number };

  // lê com o login da pessoa: só o dono (ou admin) consegue
  const { data: t } = await ((await createClient()) as unknown as SupabaseClient)
    .from("transcricoes")
    .select("id, titulo, modo, opcoes, status, duracao_seg, arquivo_nome")
    .eq("id", id)
    .maybeSingle();
  if (!t) return NextResponse.json({ error: "Transcrição não encontrada." }, { status: 404 });
  if (t.status === "processando") return NextResponse.json({ error: "Essa transcrição já está sendo feita." }, { status: 409 });
  if (t.status === "pronta") return NextResponse.json({ error: "Essa transcrição já está pronta." }, { status: 409 });

  const duracao = Math.max(0, Math.round(Number(corpo.duracao) || t.duracao_seg || 0));
  try {
    const r = await executarTranscricao(id, { modo: t.modo as ModoTranscricao, opcoes: (t.opcoes ?? {}) as OpcoesTranscricao, duracao, nome: t.arquivo_nome ?? t.titulo });
    return NextResponse.json({ ok: true, texto: r.texto, resumo: r.resumo, trechos: r.trechos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao transcrever." }, { status: 502 });
  }
}
