import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { DOCUMENT_CATEGORIES } from "@/lib/document-category";
import type { Database } from "@/lib/supabase/types";

// Route Handler em vez de Server Action: uma Server Action multipart
// (upload de arquivo) nesta página, aninhada sob o layout de /admin, entra
// numa corrida de renovação de sessão com o próprio getUser() do layout —
// cada um tenta renovar o refresh token (uso único) de forma independente,
// o Supabase detecta o reuso e revoga a sessão inteira no meio do envio.
// Reproduzido de forma consistente em 2026-08-25. Route Handler roda fora
// da árvore de render de página/layout, sem esse problema.
function sanitizeFileName(name: string): string {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_");
}

export async function POST(request: Request) {
  const profile = await requireRole(["admin", "advogado"]);

  const formData = await request.formData();
  const clientId = formData.get("client_id");
  const title = formData.get("title");
  const category = formData.get("category");
  const file = formData.get("file");

  if (typeof clientId !== "string" || !clientId) {
    return NextResponse.json({ error: "Selecione o cliente." }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Informe o título do documento." }, { status: 400 });
  }
  if (typeof category !== "string" || !DOCUMENT_CATEGORIES.includes(category as never)) {
    return NextResponse.json({ error: "Selecione a categoria." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Selecione um arquivo." }, { status: 400 });
  }

  const supabase = await createClient();
  const filePath = `${clientId}/${Date.now()}-${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
  if (uploadError) {
    return NextResponse.json({ error: "Não foi possível enviar o arquivo. Tente novamente." }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("documents").insert({
    client_id: clientId,
    uploaded_by: profile.id,
    category: category as Database["public"]["Enums"]["document_category"],
    title: title.trim(),
    file_path: filePath,
  });

  if (insertError) {
    await supabase.storage.from("documents").remove([filePath]);
    return NextResponse.json({ error: "Não foi possível salvar o documento. Tente novamente." }, { status: 500 });
  }

  revalidatePath("/admin/documents");
  return NextResponse.json({ ok: true });
}
