import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { DOCUMENT_CATEGORIES } from "@/lib/document-category";
import { deleteFile, ensureClientFolder, getDriveSession, uploadFile } from "@/lib/google-drive";
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
  let clientId = formData.get("client_id");
  const activityId = formData.get("activity_id");
  const processId = formData.get("process_id");
  const title = formData.get("title");
  const category = formData.get("category");
  const file = formData.get("file");

  const supabaseForLookup = await createClient();

  // Quando o envio vem da tela de uma atividade/processo específico, o
  // cliente nunca é escolhido no formulário — é derivado aqui a partir do
  // registro real, pra garantir que o documento fica no client_id certo
  // mesmo que o campo escondido tenha sido alterado no navegador.
  if (typeof activityId === "string" && activityId) {
    const { data: activity } = await supabaseForLookup
      .from("activities")
      .select("client_id")
      .eq("id", activityId)
      .maybeSingle();
    if (!activity) {
      return NextResponse.json({ error: "Atividade não encontrada." }, { status: 400 });
    }
    if (!activity.client_id) {
      return NextResponse.json(
        { error: "Esta atividade não tem cliente vinculado, então ainda não é possível anexar documentos a ela." },
        { status: 400 }
      );
    }
    clientId = activity.client_id;
  } else if (typeof processId === "string" && processId) {
    const { data: processRow } = await supabaseForLookup
      .from("processes")
      .select("client_id")
      .eq("id", processId)
      .maybeSingle();
    if (!processRow) {
      return NextResponse.json({ error: "Processo não encontrado." }, { status: 400 });
    }
    clientId = processRow.client_id;
  }

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

  const supabase = supabaseForLookup;

  // Com o Google Drive conectado, o arquivo vai pra pasta do cliente no Drive.
  // Se o Drive falhar por qualquer motivo, cai no Supabase Storage (como sempre
  // foi) pra o upload nunca deixar de funcionar.
  let driveFileId: string | null = null;
  let driveToken: string | null = null;
  try {
    const session = await getDriveSession();
    if (session) {
      const { data: clientRow } = await supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle();
      if (clientRow) {
        const folderId = await ensureClientFolder(session.token, session.connection, clientRow);
        driveFileId = await uploadFile(session.token, file, folderId);
        driveToken = session.token;
      }
    }
  } catch (error) {
    console.error("Upload pro Drive falhou, usando Supabase Storage:", error);
    driveFileId = null;
  }

  let filePath: string;
  if (driveFileId) {
    filePath = `drive/${driveFileId}`;
  } else {
    filePath = `${clientId}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
    if (uploadError) {
      return NextResponse.json({ error: "Não foi possível enviar o arquivo. Tente novamente." }, { status: 500 });
    }
  }

  const { error: insertError } = await supabase.from("documents").insert({
    client_id: clientId,
    activity_id: typeof activityId === "string" && activityId ? activityId : null,
    process_id: typeof processId === "string" && processId ? processId : null,
    uploaded_by: profile.id,
    category: category as Database["public"]["Enums"]["document_category"],
    title: title.trim(),
    file_path: filePath,
    drive_file_id: driveFileId,
  });

  if (insertError) {
    if (driveFileId && driveToken) {
      await deleteFile(driveToken, driveFileId).catch(() => {});
    } else {
      await supabase.storage.from("documents").remove([filePath]);
    }
    return NextResponse.json({ error: "Não foi possível salvar o documento. Tente novamente." }, { status: 500 });
  }

  revalidatePath("/admin/documents");
  if (typeof activityId === "string" && activityId) revalidatePath(`/admin/activities/${activityId}`);
  if (typeof processId === "string" && processId) revalidatePath(`/admin/processes/${processId}`);
  revalidatePath(`/admin/clients/${clientId}`);
  return NextResponse.json({ ok: true, activityId, processId });
}
