"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import type { Database } from "@/lib/supabase/types";

export type CreateTimeEntryState = { error: string | null };

export async function createOwnTimeEntryAction(
  _prevState: CreateTimeEntryState,
  formData: FormData
): Promise<CreateTimeEntryState> {
  const profile = await requireRole(["client"]);

  const activityType = formData.get("activity_type");
  const date = formData.get("date");
  const hoursRaw = formData.get("hours");
  const description = formData.get("description");

  if (typeof activityType !== "string" || !ACTIVITY_TYPES.includes(activityType as never)) {
    return { error: "Selecione o tipo de atividade." };
  }
  if (typeof date !== "string" || !date) {
    return { error: "Informe a data." };
  }
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours) || hours <= 0) {
    return { error: "Informe uma quantidade de horas válida." };
  }
  if (typeof description !== "string" || !description.trim()) {
    return { error: "Descreva o que foi feito." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").insert({
    client_id: profile.client_id!,
    advogado_id: profile.id,
    activity_type: activityType as Database["public"]["Enums"]["activity_type"],
    date,
    hours,
    description: description.trim(),
    billable: true,
  });

  if (error) {
    return { error: "Não foi possível salvar o lançamento. Tente novamente." };
  }

  revalidatePath("/dashboard/timesheet");
  redirect("/dashboard/timesheet");
}
