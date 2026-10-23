import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dadosDaAta } from "@/lib/atas/assinatura";
import { nomeDoPdf, pdfDaAta } from "@/lib/atas/pdf";
import type { AtaRow } from "@/lib/atas/gerar";

// PDF da ata para a equipe: ?v=completa (com as partes internas), cliente
// (como vai para assinatura) ou assinada (o arquivo final, com o registro).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("atas");
  const { id } = await params;
  const v = new URL(req.url).searchParams.get("v") ?? "completa";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Ata inválida." }, { status: 400 });
  const { data: ata } = await ((await createClient()) as unknown as SupabaseClient).from("atas").select("*").eq("id", id).maybeSingle<AtaRow & { pdf_final_path: string | null }>();
  if (!ata) return NextResponse.json({ error: "Ata não encontrada." }, { status: 404 });
  const dados = await dadosDaAta(ata);
  let bytes: Uint8Array;
  let nome = nomeDoPdf(dados);
  if (v === "assinada") {
    if (!ata.pdf_final_path) return NextResponse.json({ error: "A ata ainda não foi assinada por todos." }, { status: 409 });
    const { data, error } = await createAdminClient().storage.from("documents").download(ata.pdf_final_path);
    if (error || !data) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    bytes = new Uint8Array(await data.arrayBuffer());
    nome = nomeDoPdf(dados, " (assinada)");
  } else {
    bytes = new Uint8Array(await pdfDaAta(dados, ata.texto, v === "cliente" ? "cliente" : "completa"));
    if (v === "cliente") nome = nomeDoPdf(dados, " (versão do cliente)");
  }
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "no-store" },
  });
}
