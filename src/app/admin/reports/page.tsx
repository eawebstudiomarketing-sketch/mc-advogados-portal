import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { listReports } from "@/lib/data/reports";
import { exigirPermissao } from "@/lib/dal";
import { SendReportButton } from "./send-report-button";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default async function AdminReportsPage() {
  await exigirPermissao("relatorios");
  const reports = await listReports();

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Relatórios mensais</h1>
          <p className="text-sm text-muted">Relatórios em PDF gerados pro cliente acompanhar o trabalho prestado</p>
        </div>
        <Link
          href="/admin/reports/new"
          className="ui-btn"
        >
          <Plus className="h-4 w-4" aria-hidden /> Gerar relatório
        </Link>
      </div>

      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Referência</th>
              <th className="px-5 py-2.5 font-medium">Gerado em</th>
              <th className="px-5 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reports.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted">
                  Nenhum relatório gerado ainda.
                </td>
              </tr>
            )}
            {reports.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3 font-medium text-foreground">{r.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">
                  {MESES[r.reference_month]} de {r.reference_year}
                </td>
                <td className="px-5 py-3 text-foreground/70">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-0.5">
                    {r.downloadUrl && (
                      <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Baixar PDF" data-tip="Baixar PDF"><Download aria-hidden /></a>
                    )}
                    <SendReportButton reportId={r.id} alreadySent={!!r.sent_at} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
