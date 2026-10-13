"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { getClient } from "@/lib/data/clients";
import { getClientPortalUser } from "@/lib/data/team";
import { getResendClient } from "@/lib/email/resend";
import { formatCurrency } from "@/lib/mock-data";
import { destinoDeVolta } from "@/lib/voltar";

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
  redirect(destinoDeVolta(formData, "/admin/financial"));
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

export type SendReminderState = { error: string | null; success: boolean };

export async function sendReminderAction(
  _prevState: SendReminderState,
  formData: FormData
): Promise<SendReminderState> {
  const profile = await requireRole(["admin"]);

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { error: "Lançamento inválido.", success: false };
  }

  const resend = getResendClient();
  if (!resend) {
    return {
      error: "Envio de e-mail ainda não configurado (falta RESEND_API_KEY/RESEND_FROM_EMAIL).",
      success: false,
    };
  }

  const supabase = await createClient();
  const { data: record, error: recordError } = await supabase
    .from("financial_records")
    .select("*")
    .eq("id", id)
    .single();
  if (recordError || !record) {
    return { error: "Lançamento não encontrado.", success: false };
  }

  const [client, portalUser] = await Promise.all([
    getClient(record.client_id),
    getClientPortalUser(record.client_id),
  ]);
  const toEmail = portalUser?.email ?? client?.email_contact;
  if (!toEmail) {
    return { error: "Este cliente não tem e-mail de contato cadastrado.", success: false };
  }

  const dueDate = new Date(record.due_date + "T00:00:00").toLocaleDateString("pt-BR");
  const { error: sendError } = await resend.client.emails.send({
    from: resend.from,
    to: toEmail,
    subject: `Lembrete de pagamento — ${record.description}`,
    html: `
      <p>Olá,</p>
      <p>Este é um lembrete de que o pagamento abaixo está pendente:</p>
      <p>
        <strong>${record.description}</strong><br />
        Valor: ${formatCurrency(Number(record.amount))}<br />
        Vencimento: ${dueDate}
      </p>
      <p>Qualquer dúvida, fale com a equipe MC Advogados.</p>
    `,
  });
  if (sendError) {
    return { error: "Não foi possível enviar o e-mail. Tente novamente.", success: false };
  }

  await supabase.from("financial_notifications").insert({
    financial_record_id: id,
    sent_by: profile.id,
  });

  revalidatePath("/admin/financial");
  return { error: null, success: true };
}
