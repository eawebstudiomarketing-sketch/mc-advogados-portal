import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { listProcesses } from "@/lib/data/processes";
import { PROCESS_AREA_LABEL } from "@/lib/process-area";
import { StatusBadge } from "@/components/ui/status-badge";
import { deleteProcessAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { exigirPermissao } from "@/lib/dal";

export default async function AdminProcessesPage() {
  await exigirPermissao("processos");
  const processes = await listProcesses();

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Processos</h1>
          <p className="text-sm text-muted">
            {processes.length} {processes.length === 1 ? "processo cadastrado" : "processos cadastrados"}
          </p>
        </div>
        <Link
          href="/admin/processes/new"
          className="ui-btn"
        >
          <Plus className="h-4 w-4" aria-hidden /> Novo processo
        </Link>
      </div>

      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-5 py-2.5 font-medium">Número</th>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Vara / Tribunal</th>
              <th className="px-5 py-2.5 font-medium">Área</th>
              <th className="px-5 py-2.5 font-medium">Fase</th>
              <th className="px-5 py-2.5 font-medium">Responsável</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {processes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted">
                  Nenhum processo cadastrado ainda.
                </td>
              </tr>
            )}
            {processes.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-2.5 font-medium">
                  <Link href={`/admin/processes/${p.id}`} className="text-navy hover:underline">
                    {p.numero_processo}
                  </Link>
                </td>
                <td className="px-5 py-3 text-foreground/70">{p.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">{p.vara_tribunal ?? "—"}</td>
                <td className="px-5 py-3 text-foreground/70">{PROCESS_AREA_LABEL[p.area]}</td>
                <td className="px-5 py-3 text-foreground/70">{p.fase ?? "—"}</td>
                <td className="px-5 py-3 text-foreground/70">{p.profiles?.full_name ?? "—"}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-0.5">
                    <Link href={`/admin/processes/${p.id}/edit`} className="icon-btn" aria-label="Editar" data-tip="Editar"><Pencil aria-hidden /></Link>
                    <ConfirmSubmitButton
                      action={deleteProcessAction}
                      hiddenFields={{ id: p.id }}
                      confirmMessage={`Excluir o processo "${p.numero_processo}"?`}
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
