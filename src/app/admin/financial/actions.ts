"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";

export type CreateFinancialRecordState = { error: string | null };

export async function createFinancialRecordAction(
  _prevState: CreateFinancialRecordState,
  formData: FormData
): Promise<CreateFinancialRecordState> {
  // Financeiro é a única área do sistema sem acesso de advogado (regra
  // explícita do escopo original) — RLS de public.financial_records já
  // bloqueia, mas checar aqui evita a viagem ao banco só pra receber erro.
  await requireRole(["admin"]);

  const clientId = formData.get("client_id");
  const description = formData.get("description");
  const amountRaw = formData.get("amount");
  const dueDate = formData.get("due_date");

  if (typeof clientId !== "string" || !clientId) {
    return { error: "Selecione o cliente." };
  }
  if (typeof description !== "string" || !description.trim()) {
    return { error: "Informe a descrição do lançamento." };
  }
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Informe um valor válido." };
  }
  if (typeof dueDate !== "string" || !dueDate) {
    return { error: "Informe o vencimento." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("financial_records").insert({
    client_id: clientId,
    description: description.trim(),
    amount,
    due_date: dueDate,
  });

  if (error) {
    return { error: "Não foi possível salvar o lançamento. Tente novamente." };
  }

  revalidatePath("/admin/financial");
  redirect("/admin/financial");
}

export async function markAsPaidAction(formData: FormData): Promise<void> {
  await requireRole(["admin"]);

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await supabase
    .from("financial_records")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/admin/financial");
}
