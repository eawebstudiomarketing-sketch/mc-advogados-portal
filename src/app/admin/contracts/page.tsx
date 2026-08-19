import { StatusBadge } from "@/components/ui/status-badge";
import { mockContratos, formatCurrency, formatDate } from "@/lib/mock-data";

export default function AdminContractsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Contratos</h1>
          <p className="text-sm text-foreground/50">{mockContratos.length} contratos ativos</p>
        </div>
        <button className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90">
          Novo contrato
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Contrato</th>
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Início</th>
              <th className="px-5 py-3 font-medium">Valor</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockContratos.map((c) => (
              <tr key={c.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{c.title}</td>
                <td className="px-5 py-3 text-foreground/70">{c.clientName}</td>
                <td className="px-5 py-3 text-foreground/70">{formatDate(c.startDate)}</td>
                <td className="px-5 py-3 tabular-nums text-foreground/70">{formatCurrency(c.value)}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
