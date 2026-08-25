"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { DOCUMENT_CATEGORIES } from "@/lib/document-category";
import type { Database } from "@/lib/supabase/types";

// Criação (upload) vive em src/app/api/documents/upload/route.ts — Route
// Handler em vez de Server Action, ver comentário lá pro motivo.

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
