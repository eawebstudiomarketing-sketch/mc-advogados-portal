"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { CONTRACT_STATUSES } from "@/lib/contract-status";
import type { Database } from "@/lib/supabase/types";

export type CreateContractState = { error: string | null };

export async function createContractAction(
  _prevState: CreateContractState,
  formData: FormData
): Promise<CreateContractState> {
  await requireRole(["admin", "advogado"]);

  const clientId = formData.get("client_id");
  const title = formData.get("title");
  const description = formData.get("description");
  const startDate = formData.get("start_date");
  const endDate = formData.get("end_date");
  const valueRaw = formData.get("value");

  if (typeof clientId !== "string" || !clientId) {
    return { error: "Selecione o cliente." };
  }
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Informe o título do contrato." };
  }
  if (typeof startDate !== "string" || !startDate) {
    return { error: "Informe a data de início." };
  }

  let value: number | null = null;
  if (typeof valueRaw === "string" && valueRaw.trim()) {
    value = Number(valueRaw);
    if (!Number.isFinite(value) || value <= 0) {
      return { error: "Informe um valor válido." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("contracts").insert({
    client_id: clientId,
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    start_date: startDate,
    end_date: typeof endDate === "string" && endDate ? endDate : null,
    value,
  });

  if (error) {
    return { error: "Não foi possível salvar o contrato. Tente novamente." };
  }

  revalidatePath("/admin/contracts");
  redirect("/admin/contracts");
}

export async function updateContractStatusAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const status = formData.get("status");

  if (typeof id !== "string" || !id) return;
  if (typeof status !== "string" || !CONTRACT_STATUSES.includes(status as never)) return;

  const supabase = await createClient();
  await supabase
    .from("contracts")
    .update({ status: status as Database["public"]["Enums"]["contract_status"] })
    .eq("id", id);

  revalidatePath("/admin/contracts");
}

export type UpdateContractState = { error: string | null };

export async function updateContractAction(
  _prevState: UpdateContractState,
  formData: FormData
): Promise<UpdateContractState> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const title = formData.get("title");
  const description = formData.get("description");
  const startDate = formData.get("start_date");
  const endDate = formData.get("end_date");
  const valueRaw = formData.get("value");

  if (typeof id !== "string" || !id) {
    return { error: "Contrato inválido." };
  }
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Informe o título do contrato." };
  }
  if (typeof startDate !== "string" || !startDate) {
    return { error: "Informe a data de início." };
  }

  let value: number | null = null;
  if (typeof valueRaw === "string" && valueRaw.trim()) {
    value = Number(valueRaw);
    if (!Number.isFinite(value) || value <= 0) {
      return { error: "Informe um valor válido." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      title: title.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      start_date: startDate,
      end_date: typeof endDate === "string" && endDate ? endDate : null,
      value,
    })
    .eq("id", id);

  if (error) {
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  revalidatePath("/admin/contracts");
  redirect("/admin/contracts");
}

export async function deleteContractAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await supabase.from("contracts").delete().eq("id", id);

  revalidatePath("/admin/contracts");
}
