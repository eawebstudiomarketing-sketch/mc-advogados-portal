import { mockTimeEntries } from "@/lib/mock-data";

export default function AdminTimesheetPage() {
  const totalHoras = mockTimeEntries.reduce((s, t) => s + t.hours, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Timesheet</h1>
          <p className="text-sm text-foreground/50">Agosto de 2026 · {totalHoras}h lançadas</p>
        </div>
        <button className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90">
          Lançar horas
        </button>
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
            {mockTimeEntries.map((t) => (
              <tr key={t.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{t.clientName}</td>
                <td className="px-5 py-3 text-foreground/70">{t.advogado}</td>
                <td className="px-5 py-3 text-foreground/70">{t.activityType}</td>
                <td className="px-5 py-3 text-foreground/70">{new Date(t.date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
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
