import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MonthlyReportDocument } from "@/lib/pdf/monthly-report";
import { autoExportPdf } from "@/lib/drive-sync";
import type { Activity } from "@/lib/data/activities";
import type { Database } from "@/lib/supabase/types";

// Relatórios de atividades do cliente. Usado pela tela de relatórios, pela ficha
// do cliente, pelo assistente do portal e pelo portal do cliente (semana/mês).

type Db = SupabaseClient<Database>;

export { MESES, intervaloDoMes, intervaloDaSemana } from "@/lib/relatorio-datas";
import { intervaloDoMes } from "@/lib/relatorio-datas";

export type AtividadesDoPeriodo = { concluidas: Activity[]; emAndamento: Activity[]; aFazer: Activity[] };

// Concluídas = fechadas dentro do período (a tabela não tem data de conclusão,
// então usa a última atualização). Em andamento e a fazer = situação atual.
export async function atividadesDoPeriodo(db: Db, clientId: string, inicio: string, fim: string): Promise<AtividadesDoPeriodo> {
  const [concl, abertas] = await Promise.all([
    db
      .from("activities")
      .select("*, clients(name), profiles(full_name)")
      .eq("client_id", clientId)
      .eq("status", "concluida")
      .gte("updated_at", inicio)
      .lt("updated_at", fim)
      .order("updated_at"),
    db
      .from("activities")
      .select("*, clients(name), profiles(full_name)")
      .eq("client_id", clientId)
      .in("status", ["aberta", "em_andamento"])
      .is("archived_at", null)
      .order("deadline", { ascending: true, nullsFirst: false }),
  ]);
  if (concl.error || abertas.error) throw new Error("Não foi possível buscar as atividades do período.");
  const ab = abertas.data as Activity[];
  return { concluidas: concl.data as Activity[], emAndamento: ab.filter((a) => a.status === "em_andamento"), aFazer: ab.filter((a) => a.status === "aberta") };
}

export async function pdfDoRelatorio(opts: {
  clientName: string;
  mes: number;
  ano: number;
  periodo?: { rotulo: string; sufixo: string };
  atividades: AtividadesDoPeriodo;
}): Promise<Buffer> {
  return renderToBuffer(
    <MonthlyReportDocument
      clientName={opts.clientName}
      referenceMonth={opts.mes}
      referenceYear={opts.ano}
      periodo={opts.periodo}
      concluidas={opts.atividades.concluidas}
      emAndamento={opts.atividades.emAndamento}
      aFazer={opts.atividades.aFazer}
    />
  );
}

/** Gera (ou substitui) o relatório mensal do cliente: PDF no Storage + registro + cópia no Drive. */
export async function gerarRelatorioMensal(
  db: Db,
  opts: { clientId: string; clientName: string; mes: number; ano: number; profileId: string }
): Promise<{ ok: true; filePath: string } | { ok: false; error: string }> {
  const { clientId, mes, ano } = opts;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return { ok: false, error: "Mês inválido." };
  if (!Number.isInteger(ano) || ano < 2020) return { ok: false, error: "Ano inválido." };

  let atividades: AtividadesDoPeriodo;
  try {
    const { inicio, fim } = intervaloDoMes(ano, mes);
    atividades = await atividadesDoPeriodo(db, clientId, inicio, fim);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao buscar atividades." };
  }

  const pdf = await pdfDoRelatorio({ clientName: opts.clientName, mes, ano, atividades });
  const filePath = `${clientId}/relatorios/${ano}-${String(mes).padStart(2, "0")}.pdf`;
  const { error: upErr } = await db.storage.from("documents").upload(filePath, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) return { ok: false, error: "Não foi possível salvar o PDF gerado." };

  const { error: regErr } = await db
    .from("monthly_reports")
    .upsert(
      { client_id: clientId, reference_month: mes, reference_year: ano, pdf_url: filePath, sent_by: opts.profileId },
      { onConflict: "client_id,reference_year,reference_month" }
    );
  if (regErr) return { ok: false, error: "PDF gerado, mas não foi possível salvar o registro." };

  // relatório regerado = PDF novo: solta o vínculo antigo do Drive e manda o novo
  await db.from("monthly_reports").update({ drive_file_id: null }).eq("client_id", clientId).eq("reference_year", ano).eq("reference_month", mes);
  await autoExportPdf(opts.profileId, "reports", clientId);
  return { ok: true, filePath };
}
