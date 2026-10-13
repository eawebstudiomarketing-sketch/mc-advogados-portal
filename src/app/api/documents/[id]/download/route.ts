import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { downloadFile, getDriveSession } from "@/lib/google-drive";

// Entrega documentos que estão no Google Drive. O portal é quem checa a
// permissão: a linha do documento é lida com o cliente Supabase do usuário
// (RLS — cliente só vê os próprios, equipe vê os do escritório) e só então o
// arquivo é buscado no Drive com a credencial do servidor. Ninguém recebe
// acesso direto ao Drive.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, drive_file_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc || !doc.drive_file_id) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });

  try {
    const session = await getDriveSession();
    if (!session) return NextResponse.json({ error: "O Google Drive não está conectado." }, { status: 503 });

    const file = await downloadFile(session.token, doc.drive_file_id);
    const filename = encodeURIComponent(file.name);
    return new Response(file.stream, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": "inline; filename*=UTF-8''" + filename,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Drive download:", error);
    return NextResponse.json({ error: "Não foi possível abrir o arquivo no Drive." }, { status: 502 });
  }
}
