import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { listContracts } from "@/lib/data/contracts";
import { StatusSelect } from "./status-select";
import { deleteContractAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { exigirPermissao } from "@/lib/dal";

export default async function AdminContractsPage() {
  await exigirPermissao("contratos");
  const contracts = await listContracts();

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Contratos</h1>
          <p className="text-sm text-muted">
            {contracts.length} {contracts.length === 1 ? "contrato cadastrado" : "contratos cadastrados"}
          </p>
        </div>
        <Link
          href="/admin/contracts/new"
          className="ui-btn"
        >
          <Plus className="h-4 w-4" aria-hidden /> Novo contrato
        </Link>
      </div>

      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-5 py-2.5 font-medium">Contrato</th>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Início</th>
              <th className="px-5 py-2.5 font-medium">Valor</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contracts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted">
                  Nenhum contrato cadastrado ainda.
                </td>
              </tr>
            )}
            {contracts.map((c) => (
              <tr key={c.id}>
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
                  <div className="flex items-center justify-end gap-0.5">
                    <Link href={`/admin/contracts/${c.id}/edit`} className="icon-btn" aria-label="Editar" data-tip="Editar"><Pencil aria-hidden /></Link>
                    <ConfirmSubmitButton
                      action={deleteContractAction}
                      hiddenFields={{ id: c.id }}
                      confirmMessage={`Excluir o contrato "${c.title}"?`}
                      label="Excluir"
                      icon="trash"
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
