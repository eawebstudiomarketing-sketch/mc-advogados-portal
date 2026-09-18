import Link from "next/link";
import { listProcesses } from "@/lib/data/processes";
import { PROCESS_AREA_LABEL } from "@/lib/process-area";
import { StatusBadge } from "@/components/ui/status-badge";
import { deleteProcessAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

export default async function AdminProcessesPage() {
  const processes = await listProcesses();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Processos</h1>
          <p className="text-sm text-foreground/50">
            {processes.length} {processes.length === 1 ? "processo cadastrado" : "processos cadastrados"}
          </p>
        </div>
        <Link
          href="/admin/processes/new"
          className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90"
        >
          Novo processo
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Número</th>
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Vara / Tribunal</th>
              <th className="px-5 py-3 font-medium">Área</th>
              <th className="px-5 py-3 font-medium">Fase</th>
              <th className="px-5 py-3 font-medium">Responsável</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {processes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-sm text-foreground/50">
                  Nenhum processo cadastrado ainda.
                </td>
              </tr>
            )}
            {processes.map((p) => (
              <tr key={p.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium">
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
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/admin/processes/${p.id}/edit`} className="text-xs font-medium text-navy hover:underline">
                      Editar
                    </Link>
                    <ConfirmSubmitButton
                      action={deleteProcessAction}
                      hiddenFields={{ id: p.id }}
                      confirmMessage={`Excluir o processo "${p.numero_processo}"?`}
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
