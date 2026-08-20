import Link from "next/link";
import { listTimeEntries } from "@/lib/data/time-entries";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { formatDate } from "@/lib/mock-data";

export default async function AdminTimesheetPage() {
  const entries = await listTimeEntries();
  const totalHoras = entries.reduce((s, t) => s + Number(t.hours), 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Timesheet</h1>
          <p className="text-sm text-foreground/50">
            {entries.length === 0 ? "Nenhum lançamento ainda" : `${totalHoras}h lançadas no total`}
          </p>
        </div>
        <Link
          href="/admin/timesheet/new"
          className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90"
        >
          Lançar horas
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Advogado(a)</th>
              <th className="px-5 py-3 font-medium">Atividade</th>
              <th className="px-5 py-3 font-medium">Data</th>
              <th className="px-5 py-3 font-medium">Horas</th>
              <th className="px-5 py-3 font-medium">Faturável</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-foreground/50">
                  Nenhum lançamento de horas ainda.
                </td>
              </tr>
            )}
            {entries.map((t) => (
              <tr key={t.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{t.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">{t.profiles?.full_name}</td>
                <td className="px-5 py-3 text-foreground/70">{ACTIVITY_TYPE_LABEL[t.activity_type]}</td>
                <td className="px-5 py-3 text-foreground/70">{formatDate(t.date)}</td>
                <td className="px-5 py-3 tabular-nums text-foreground/70">{t.hours}h</td>
                <td className="px-5 py-3 text-foreground/70">{t.billable ? "Sim" : "Não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
