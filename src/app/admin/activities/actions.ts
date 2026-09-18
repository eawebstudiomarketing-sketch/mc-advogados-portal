"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import { ACTIVITY_STATUSES } from "@/lib/activity-status";
import type { Database } from "@/lib/supabase/types";

export type CreateActivityState = { error: string | null };

export async function createActivityAction(
  _prevState: CreateActivityState,
  formData: FormData
): Promise<CreateActivityState> {
  const profile = await requireRole(["admin", "advogado"]);

  const clientId = formData.get("client_id");
  const title = formData.get("title");
  const description = formData.get("description");
  const type = formData.get("type");
  const deadline = formData.get("deadline");

  if (typeof clientId !== "string" || !clientId) {
    return { error: "Selecione o cliente." };
  }
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Informe o título da atividade." };
  }
  if (typeof type !== "string" || !ACTIVITY_TYPES.includes(type as never)) {
    return { error: "Selecione o tipo de atividade." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    client_id: clientId,
    responsible_id: profile.id,
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    type: type as Database["public"]["Enums"]["activity_type"],
    deadline: typeof deadline === "string" && deadline ? deadline : null,
  });

  if (error) {
    return { error: "Não foi possível salvar a atividade. Tente novamente." };
  }

  revalidatePath("/admin/activities");
  redirect("/admin/activities");
}

export async function updateActivityStatusAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const status = formData.get("status");

  if (typeof id !== "string" || !id) return;
  if (typeof status !== "string" || !ACTIVITY_STATUSES.includes(status as never)) return;

  const supabase = await createClient();
  await supabase
    .from("activities")
    .update({ status: status as Database["public"]["Enums"]["activity_status"] })
    .eq("id", id);

  revalidatePath("/admin/activities");
}

export type UpdateActivityState = { error: string | null };

export async function updateActivityAction(
  _prevState: UpdateActivityState,
  formData: FormData
): Promise<UpdateActivityState> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const title = formData.get("title");
  const description = formData.get("description");
  const type = formData.get("type");
  const deadline = formData.get("deadline");

  if (typeof id !== "string" || !id) {
    return { error: "Atividade inválida." };
  }
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Informe o título da atividade." };
  }
  if (typeof type !== "string" || !ACTIVITY_TYPES.includes(type as never)) {
    return { error: "Selecione o tipo de atividade." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("activities")
    .update({
      title: title.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      type: type as Database["public"]["Enums"]["activity_type"],
      deadline: typeof deadline === "string" && deadline ? deadline : null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  revalidatePath("/admin/activities");
  redirect("/admin/activities");
}

export async function deleteActivityAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await supabase.from("activities").delete().eq("id", id);

  revalidatePath("/admin/activities");
  redirect("/admin/activities");
}
