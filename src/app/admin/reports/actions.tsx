"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";
import { getClient } from "@/lib/data/clients";
import { getClientPortalUser } from "@/lib/data/team";
import { getResendClient } from "@/lib/email/resend";
import { gerarRelatorioMensal } from "@/lib/relatorio";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export type GenerateReportState = { error: string | null };

export async function generateReportAction(
  _prevState: GenerateReportState,
  formData: FormData
): Promise<GenerateReportState> {
  const { profile: profile } = await exigirPermissao("relatorios");

  const clientId = formData.get("client_id");
  const month = Number(formData.get("reference_month"));
  const year = Number(formData.get("reference_year"));

  if (typeof clientId !== "string" || !clientId) {
    return { error: "Selecione o cliente." };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "Mês inválido." };
  }
  if (!Number.isInteger(year) || year < 2020) {
    return { error: "Ano inválido." };
  }

  const client = await getClient(clientId);
  if (!client) return { error: "Cliente não encontrado." };

  const supabase = await createClient();
  const r = await gerarRelatorioMensal(supabase, { clientId, clientName: client.name, mes: month, ano: year, profileId: profile.id });
  if (!r.ok) return { error: `${r.error} Tente novamente.` };

  revalidatePath("/admin/reports");
  revalidatePath(`/admin/clients/${clientId}`);
  // gerado pela ficha do cliente: volta para a aba Relatórios do cliente
  const voltar = formData.get("return_to");
  if (typeof voltar === "string" && voltar.startsWith(`/admin/clients/${clientId}`)) redirect(voltar);
  redirect("/admin/reports");
}

export type SendReportEmailState = { error: string | null; success: boolean };

export async function sendReportEmailAction(
  _prevState: SendReportEmailState,
  formData: FormData
): Promise<SendReportEmailState> {
  const { profile: profile } = await exigirPermissao("relatorios");

  const reportId = formData.get("report_id");
  if (typeof reportId !== "string" || !reportId) {
    return { error: "Relatório inválido.", success: false };
  }

  const resend = getResendClient();
  if (!resend) {
    return {
      error: "Envio de e-mail ainda não configurado (falta RESEND_API_KEY/RESEND_FROM_EMAIL).",
      success: false,
    };
  }

  const supabase = await createClient();
  const { data: report, error: reportError } = await supabase
    .from("monthly_reports")
    .select("*")
    .eq("id", reportId)
    .single();
  if (reportError || !report || !report.pdf_url) {
    return { error: "Relatório não encontrado.", success: false };
  }

  const [client, portalUser, pdfDownload] = await Promise.all([
    getClient(report.client_id),
    getClientPortalUser(report.client_id),
    supabase.storage.from("documents").download(report.pdf_url),
  ]);

  const toEmail = portalUser?.email ?? client?.email_contact;
  if (!toEmail) {
    return { error: "Este cliente não tem e-mail de contato cadastrado.", success: false };
  }
  if (pdfDownload.error || !pdfDownload.data) {
    return { error: "Não foi possível carregar o PDF gerado. Gere o relatório de novo.", success: false };
  }

  const pdfBuffer = Buffer.from(await pdfDownload.data.arrayBuffer());
  const referencia = `${MESES[report.reference_month]} de ${report.reference_year}`;

  const { error: sendError } = await resend.client.emails.send({
    from: resend.from,
    to: toEmail,
    subject: `Relatório mensal — ${referencia}`,
    html: `
      <p>Olá,</p>
      <p>Segue em anexo o relatório de ${referencia}, com as atividades concluídas no mês, as que estão em andamento e as próximas.</p>
      <p>Qualquer dúvida, fale com a equipe MC Advogados.</p>
    `,
    attachments: [
      {
        filename: `relatorio-${report.reference_year}-${String(report.reference_month).padStart(2, "0")}.pdf`,
        content: pdfBuffer,
      },
    ],
  });
  if (sendError) {
    return { error: "Não foi possível enviar o e-mail. Tente novamente.", success: false };
  }

  await supabase.from("monthly_reports").update({ sent_at: new Date().toISOString(), sent_by: profile.id }).eq("id", reportId);

  revalidatePath("/admin/reports");
  return { error: null, success: true };
}
