import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { listFinancialRecords } from "@/lib/data/financial";
import { markAsPaidAction } from "./actions";
import { ReminderButton } from "./reminder-button";
import { requireRole } from "@/lib/dal";
import { formatCurrency, formatDate } from "@/lib/mock-data";

export default async function AdminFinancialPage() {
  // Financeiro é a única área sem acesso de advogado — sem isso, um
  // advogado logado veria a lista vazia (RLS bloqueia a query) e pareceria
  // que não há nenhum lançamento, quando na verdade ele só não tem acesso.
  await requireRole(["admin"]);
  const records = await listFinancialRecords();

  const recebido = records.filter((f) => f.status === "paid").reduce((s, f) => s + Number(f.amount), 0);
  const pendente = records.filter((f) => f.status === "pending").reduce((s, f) => s + Number(f.amount), 0);
  const atrasado = records.filter((f) => f.status === "overdue").reduce((s, f) => s + Number(f.amount), 0);

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Financeiro</h1>
          <p className="text-sm text-muted">
            {records.length === 0 ? "Nenhum lançamento ainda" : `${records.length} lançamentos`}
          </p>
        </div>
        <Link
          href="/admin/financial/new"
          className="ui-btn-secondary px-3 py-1.5 text-xs"
        >
          Novo lançamento
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Recebido" value={formatCurrency(recebido)} tone="success" />
        <StatCard label="A receber" value={formatCurrency(pendente)} tone="pending" />
        <StatCard label="Em atraso" value={formatCurrency(atrasado)} tone="danger" />
      </div>

      <div className="mt-6 overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Descrição</th>
              <th className="px-5 py-2.5 font-medium">Vencimento</th>
              <th className="px-5 py-2.5 font-medium">Valor</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted">
                  Nenhum lançamento financeiro ainda.
                </td>
              </tr>
            )}
            {records.map((f) => (
              <tr key={f.id}>
                <td className="px-5 py-3 font-medium text-foreground">{f.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">{f.description}</td>
                <td className="px-5 py-3 text-foreground/70">{formatDate(f.due_date)}</td>
                <td className="px-5 py-3 tabular-nums text-foreground/70">{formatCurrency(Number(f.amount))}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={f.status} />
                </td>
                <td className="px-5 py-3">
                  {f.status !== "paid" && (
                    <div className="flex flex-col items-end gap-1.5">
                      <form action={markAsPaidAction}>
                        <input type="hidden" name="id" value={f.id} />
                        <button type="submit" className="ui-link">
                          Marcar como pago
                        </button>
                      </form>
                      <ReminderButton id={f.id} />
                    </div>
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
