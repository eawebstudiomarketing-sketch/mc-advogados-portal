"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { getClient } from "@/lib/data/clients";
import { MonthlyReportDocument } from "@/lib/pdf/monthly-report";
import type { Database } from "@/lib/supabase/types";

export type GenerateReportState = { error: string | null };

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end };
}

export async function generateReportAction(
  _prevState: GenerateReportState,
  formData: FormData
): Promise<GenerateReportState> {
  const profile = await requireRole(["admin"]);

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
  const { start, end } = monthRange(year, month);

  const [timeEntriesRes, activitiesRes, financialRes] = await Promise.all([
    supabase
      .from("time_entries")
      .select("*, clients(name), profiles(full_name)")
      .eq("client_id", clientId)
      .gte("date", start)
      .lt("date", end),
    supabase
      .from("activities")
      .select("*, clients(name), profiles(full_name)")
      .eq("client_id", clientId)
      .gte("created_at", start)
      .lt("created_at", end),
    supabase
      .from("financial_records")
      .select("*, clients(name)")
      .eq("client_id", clientId)
      .gte("due_date", start)
      .lt("due_date", end),
  ]);

  if (timeEntriesRes.error || activitiesRes.error || financialRes.error) {
    return { error: "Não foi possível buscar os dados do período. Tente novamente." };
  }

  const pdfBuffer = await renderToBuffer(
    <MonthlyReportDocument
      clientName={client.name}
      referenceMonth={month}
      referenceYear={year}
      timeEntries={timeEntriesRes.data}
      activities={activitiesRes.data}
      financialRecords={financialRes.data}
    />
  );

  const filePath = `${clientId}/relatorios/${year}-${String(month).padStart(2, "0")}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    return { error: "Não foi possível salvar o PDF gerado. Tente novamente." };
  }

  const { error: upsertError } = await supabase
    .from("monthly_reports")
    .upsert(
      {
        client_id: clientId,
        reference_month: month,
        reference_year: year,
        pdf_url: filePath,
        sent_by: profile.id,
      } satisfies Database["public"]["Tables"]["monthly_reports"]["Insert"],
      { onConflict: "client_id,reference_year,reference_month" }
    );
  if (upsertError) {
    return { error: "PDF gerado, mas não foi possível salvar o registro. Tente novamente." };
  }

  revalidatePath("/admin/reports");
  redirect("/admin/reports");
}
