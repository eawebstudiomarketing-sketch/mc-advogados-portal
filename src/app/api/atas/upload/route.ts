import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";

// Envio de ATA de reunião (Route Handler pelo mesmo motivo do upload de
// documentos: ver app/api/documents/upload). A ATA é interna do escritório:
// o arquivo vai para internal/{client_id}/atas/, fora da pasta {client_id}/
// que o cliente consegue ler no Storage, e não é enviado ao Google Drive.
function sanitizeFileName(name: string): string {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_");
}

export async function POST(request: Request) {
  const { profile: profile } = await exigirPermissao("atas");

  const formData = await request.formData();
  const clientId = formData.get("client_id");
  const title = formData.get("title");
  const meetingDate = formData.get("meeting_date");
  const file = formData.get("file");

  if (typeof clientId !== "string" || !clientId) {
    return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Informe o título da ATA." }, { status: 400 });
  }
  const data = typeof meetingDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(meetingDate) ? meetingDate : null;
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Selecione o arquivo da ATA." }, { status: 400 });
  }

  const supabase = await createClient();
  const filePath = `internal/${clientId}/atas/${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, file, { contentType: file.type || undefined });
  if (uploadError) {
    return NextResponse.json({ error: "Não foi possível enviar o arquivo. Tente novamente." }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("documents").insert({
    client_id: clientId,
    uploaded_by: profile.id,
    category: "ata",
    title: title.trim(),
    file_path: filePath,
    meeting_date: data,
  });
  if (insertError) {
    await supabase.storage.from("documents").remove([filePath]);
    return NextResponse.json({ error: "Não foi possível salvar a ATA. Tente novamente." }, { status: 500 });
  }

  revalidatePath(`/admin/clients/${clientId}`);
  return NextResponse.json({ ok: true });
}
