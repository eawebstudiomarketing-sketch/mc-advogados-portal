import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { mockFinanceiro, formatCurrency, formatDate } from "@/lib/mock-data";

export default function AdminFinancialPage() {
  const recebido = mockFinanceiro.filter((f) => f.status === "pago").reduce((s, f) => s + f.amount, 0);
  const pendente = mockFinanceiro.filter((f) => f.status === "pendente").reduce((s, f) => s + f.amount, 0);
  const atrasado = mockFinanceiro.filter((f) => f.status === "atrasado").reduce((s, f) => s + f.amount, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Financeiro</h1>
          <p className="text-sm text-foreground/50">Agosto de 2026</p>
        </div>
        <button className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-navy hover:bg-navy hover:text-navy-foreground">
          Novo lançamento
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Recebido no mês" value={formatCurrency(recebido)} tone="success" />
        <StatCard label="A receber" value={formatCurrency(pendente)} tone="pending" />
        <StatCard label="Em atraso" value={formatCurrency(atrasado)} tone="danger" />
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Descrição</th>
              <th className="px-5 py-3 font-medium">Vencimento</th>
              <th className="px-5 py-3 font-medium">Valor</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockFinanceiro.map((f) => (
              <tr key={f.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{f.clientName}</td>
                <td className="px-5 py-3 text-foreground/70">{f.description}</td>
                <td className="px-5 py-3 text-foreground/70">{formatDate(f.dueDate)}</td>
                <td className="px-5 py-3 tabular-nums text-foreground/70">{formatCurrency(f.amount)}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={f.status} />
                </td>
                <td className="px-5 py-3">
                  {f.status !== "pago" && (
                    <button className="text-xs font-medium text-navy hover:underline">Enviar lembrete</button>
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
