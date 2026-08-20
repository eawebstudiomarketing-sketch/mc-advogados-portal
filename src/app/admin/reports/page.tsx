import Link from "next/link";
import { listReports } from "@/lib/data/reports";
import { requireRole } from "@/lib/dal";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default async function AdminReportsPage() {
  await requireRole(["admin"]);
  const reports = await listReports();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Relatórios mensais</h1>
          <p className="text-sm text-foreground/50">Relatórios em PDF gerados pro cliente acompanhar o trabalho prestado</p>
        </div>
        <Link
          href="/admin/reports/new"
          className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90"
        >
          Gerar relatório
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Referência</th>
              <th className="px-5 py-3 font-medium">Gerado em</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {reports.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-foreground/50">
                  Nenhum relatório gerado ainda.
                </td>
              </tr>
            )}
            {reports.map((r) => (
              <tr key={r.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{r.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">
                  {MESES[r.reference_month]} de {r.reference_year}
                </td>
                <td className="px-5 py-3 text-foreground/70">
                  {new Date(r.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-5 py-3">
                  {r.downloadUrl && (
                    <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-navy hover:underline">
                      Baixar PDF
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
