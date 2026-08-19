import { StatusBadge } from "@/components/ui/status-badge";
import { mockAtividades, formatDate } from "@/lib/mock-data";

export default function AdminActivitiesPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Atividades</h1>
          <p className="text-sm text-foreground/50">{mockAtividades.length} atividades registradas</p>
        </div>
        <button className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90">
          Nova atividade
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Atividade</th>
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Responsável</th>
              <th className="px-5 py-3 font-medium">Prazo</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockAtividades.map((a) => (
              <tr key={a.id} className="hover:bg-background">
                <td className="px-5 py-3">
                  <p className="font-medium text-foreground">{a.title}</p>
                  <p className="text-xs text-foreground/50">{a.type}</p>
                </td>
                <td className="px-5 py-3 text-foreground/70">{a.clientName}</td>
                <td className="px-5 py-3 text-foreground/70">{a.responsible}</td>
                <td className="px-5 py-3 text-foreground/70">{formatDate(a.deadline)}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={a.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
