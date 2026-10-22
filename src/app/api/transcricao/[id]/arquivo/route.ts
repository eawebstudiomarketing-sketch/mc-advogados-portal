import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { docxDeBlocos, MIME_DOCX } from "@/lib/docx-simples";
import { TranscricaoPdf } from "@/lib/pdf/transcricao";
import { blocosDoDocumento, nomeDeArquivo, type ParteExport, type TranscricaoDados } from "@/lib/transcricao-formato";

// Baixar a transcrição em PDF (timbre do escritório) ou Word (.docx).
// ?formato=pdf|docx&parte=ambos|texto|resumo
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin", "advogado"]);
  const { id } = await params;
  const url = new URL(request.url);
  const formato = url.searchParams.get("formato") === "docx" ? "docx" : "pdf";
  const parte = (["ambos", "texto", "resumo"].includes(url.searchParams.get("parte") ?? "") ? url.searchParams.get("parte") : "ambos") as ParteExport;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Transcrição inválida.", { status: 400 });

  const { data } = await ((await createClient()) as unknown as SupabaseClient)
    .from("transcricoes")
    .select("titulo, created_at, duracao_seg, arquivo_nome, texto, resumo")
    .eq("id", id)
    .maybeSingle();
  if (!data) return new Response("Transcrição não encontrada.", { status: 404 });
  const t = data as TranscricaoDados;
  const blocos = blocosDoDocumento(t, parte);

  const corpo = formato === "docx" ? docxDeBlocos(blocos) : new Uint8Array(await renderToBuffer(createElement(TranscricaoPdf, { blocos }) as Parameters<typeof renderToBuffer>[0]));
  const nome = nomeDeArquivo(t.titulo, formato);
  return new Response(corpo as BodyInit, {
    headers: {
      "Content-Type": formato === "docx" ? MIME_DOCX : "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "no-store",
    },
  });
}
