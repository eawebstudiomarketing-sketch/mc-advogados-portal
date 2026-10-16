"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";

// Foto de perfil de um responsável. O admin troca a de qualquer pessoa; cada
// um troca a própria. Vai para o bucket público "avatars".

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const LIMITE = 3 * 1024 * 1024;

export async function enviarFotoAction(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  const responsavelId = String(formData.get("responsavel_id") ?? "");
  const arquivo = formData.get("foto");
  if (!(arquivo instanceof File) || !arquivo.size) return { ok: false, error: "Escolha uma imagem." };
  const ext = TIPOS[arquivo.type];
  if (!ext) return { ok: false, error: "Use JPG, PNG ou WEBP." };
  if (arquivo.size > LIMITE) return { ok: false, error: "A foto pode ter no máximo 3 MB." };

  const db = createAdminClient();
  const { data: resp } = await db.from("responsaveis").select("id, profile_id").eq("id", responsavelId).maybeSingle();
  if (!resp) return { ok: false, error: "Pessoa não encontrada." };
  if (profile.role !== "admin" && resp.profile_id !== profile.id) return { ok: false, error: "Você só pode trocar a sua foto." };

  const caminho = `${resp.id}/${Date.now()}.${ext}`;
  const { error } = await db.storage.from("avatars").upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (error) return { ok: false, error: "Não foi possível enviar a foto." };
  const url = db.storage.from("avatars").getPublicUrl(caminho).data.publicUrl;
  await db.from("responsaveis").update({ foto_url: url }).eq("id", resp.id);

  revalidatePath("/admin", "layout");
  revalidatePath("/account");
  return { ok: true, url };
}
