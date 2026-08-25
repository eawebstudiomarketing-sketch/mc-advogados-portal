"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import type { Database } from "@/lib/supabase/types";

export type CreateActivityState = { error: string | null };

export async function createOwnActivityAction(
  _prevState: CreateActivityState,
  formData: FormData
): Promise<CreateActivityState> {
  const profile = await requireRole(["client"]);

  const title = formData.get("title");
  const description = formData.get("description");
  const type = formData.get("type");
  const deadline = formData.get("deadline");

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Informe o título da atividade." };
  }
  if (typeof type !== "string" || !ACTIVITY_TYPES.includes(type as never)) {
    return { error: "Selecione o tipo de atividade." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("activities").insert({
    client_id: profile.client_id!,
    responsible_id: profile.id,
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    type: type as Database["public"]["Enums"]["activity_type"],
    deadline: typeof deadline === "string" && deadline ? deadline : null,
  });

  if (error) {
    return { error: "Não foi possível salvar a atividade. Tente novamente." };
  }

  revalidatePath("/dashboard/activities");
  redirect("/dashboard/activities");
}
