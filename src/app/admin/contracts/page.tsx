import Link from "next/link";
import { listContracts } from "@/lib/data/contracts";
import { StatusSelect } from "./status-select";
import { deleteContractAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatCurrency, formatDate } from "@/lib/mock-data";

export default async function AdminContractsPage() {
  const contracts = await listContracts();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Contratos</h1>
          <p className="text-sm text-foreground/50">
            {contracts.length} {contracts.length === 1 ? "contrato cadastrado" : "contratos cadastrados"}
          </p>
        </div>
        <Link
          href="/admin/contracts/new"
          className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90"
        >
          Novo contrato
        </Link>
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
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contracts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-foreground/50">
                  Nenhum contrato cadastrado ainda.
                </td>
              </tr>
            )}
            {contracts.map((c) => (
              <tr key={c.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{c.title}</td>
                <td className="px-5 py-3 text-foreground/70">{c.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">{formatDate(c.start_date)}</td>
                <td className="px-5 py-3 tabular-nums text-foreground/70">
                  {c.value ? formatCurrency(Number(c.value)) : "—"}
                </td>
                <td className="px-5 py-3">
                  <StatusSelect id={c.id} status={c.status} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/admin/contracts/${c.id}/edit`} className="text-xs font-medium text-navy hover:underline">
                      Editar
                    </Link>
                    <ConfirmSubmitButton
                      action={deleteContractAction}
                      hiddenFields={{ id: c.id }}
                      confirmMessage={`Excluir o contrato "${c.title}"?`}
                      label="Excluir"
                      className="text-xs font-medium text-status-danger hover:underline"
                    />
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
