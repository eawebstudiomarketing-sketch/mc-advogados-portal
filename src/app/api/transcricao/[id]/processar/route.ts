import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apagarAudio, transcrever } from "@/lib/transcricao";
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
  const adm = createAdminClient() as unknown as SupabaseClient;
  await adm.from("transcricoes").update({ status: "processando", erro: null, duracao_seg: duracao || null }).eq("id", id);
  try {
    const r = await transcrever(id, { modo: t.modo as ModoTranscricao, opcoes: (t.opcoes ?? {}) as OpcoesTranscricao, duracao, nome: t.arquivo_nome ?? t.titulo });
    await adm.from("transcricoes").update({ status: "pronta", texto: r.texto, resumo: r.resumo, updated_at: new Date().toISOString() }).eq("id", id);
    await apagarAudio(id);
    return NextResponse.json({ ok: true, texto: r.texto, resumo: r.resumo, trechos: r.trechos });
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Falha ao transcrever.";
    console.error("transcrição:", id, erro);
    // o áudio fica no servidor para "Tentar de novo"
    await adm.from("transcricoes").update({ status: "erro", erro }).eq("id", id);
    return NextResponse.json({ error: erro }, { status: 502 });
  }
}
