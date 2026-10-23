import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirPorToken } from "@/lib/atas/assinatura";
import { nomeDoPdf } from "@/lib/atas/pdf";

// PDF da página pública de assinatura: a versão exata que está sendo
// assinada; depois que todos assinam, a versão final com o registro.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await abrirPorToken(token);
  if (!p || p.assinatura.status === "cancelada") return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  const final = p.ata.status === "assinada" && p.ata.pdf_final_path && p.assinatura.versao === p.ata.versao;
  const caminho = final ? p.ata.pdf_final_path : p.ata.pdf_cliente_path;
  if (!caminho) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const { data, error } = await createAdminClient().storage.from("documents").download(caminho);
  if (error || !data) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const nome = nomeDoPdf(p.dados, final ? " (assinada)" : "");
  return new NextResponse(data.stream(), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nome)}`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
