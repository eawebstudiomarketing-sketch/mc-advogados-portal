"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { DOCUMENT_CATEGORIES } from "@/lib/document-category";
import type { Database } from "@/lib/supabase/types";

export type CreateDocumentState = { error: string | null };

function sanitizeFileName(name: string): string {
  return name.normalize("NFKD").replace(/[^\w.\-]+/g, "_");
}

export async function createDocumentAction(
  _prevState: CreateDocumentState,
  formData: FormData
): Promise<CreateDocumentState> {
  const profile = await requireRole(["admin", "advogado"]);

  const clientId = formData.get("client_id");
  const title = formData.get("title");
  const category = formData.get("category");
  const file = formData.get("file");

  if (typeof clientId !== "string" || !clientId) {
    return { error: "Selecione o cliente." };
  }
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Informe o título do documento." };
  }
  if (typeof category !== "string" || !DOCUMENT_CATEGORIES.includes(category as never)) {
    return { error: "Selecione a categoria." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione um arquivo." };
  }

  const supabase = await createClient();
  const filePath = `${clientId}/${Date.now()}-${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file);
  if (uploadError) {
    return { error: "Não foi possível enviar o arquivo. Tente novamente." };
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
    return { error: "Não foi possível salvar o documento. Tente novamente." };
  }

  revalidatePath("/admin/documents");
  redirect("/admin/documents");
}

export type UpdateDocumentState = { error: string | null };

export async function updateDocumentAction(
  _prevState: UpdateDocumentState,
  formData: FormData
): Promise<UpdateDocumentState> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const title = formData.get("title");
  const category = formData.get("category");

  if (typeof id !== "string" || !id) {
    return { error: "Documento inválido." };
  }
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Informe o título do documento." };
  }
  if (typeof category !== "string" || !DOCUMENT_CATEGORIES.includes(category as never)) {
    return { error: "Selecione a categoria." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({
      title: title.trim(),
      category: category as Database["public"]["Enums"]["document_category"],
    })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  revalidatePath("/admin/documents");
  redirect("/admin/documents");
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const filePath = formData.get("file_path");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await supabase.from("documents").delete().eq("id", id);
  if (typeof filePath === "string" && filePath) {
    await supabase.storage.from("documents").remove([filePath]);
  }

  revalidatePath("/admin/documents");
}
