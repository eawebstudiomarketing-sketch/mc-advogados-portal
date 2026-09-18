import Link from "next/link";
import { notFound } from "next/navigation";
import { getProcess } from "@/lib/data/processes";
import { listDocuments } from "@/lib/data/documents";
import { deleteProcessAction } from "../actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PROCESS_AREA_LABEL } from "@/lib/process-area";

export default async function ProcessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const process = await getProcess(id);
  if (!process) notFound();

  const documents = await listDocuments({ processId: id });

  return (
    <div>
      <Link href="/admin/processes" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para processos
      </Link>

      <div className="mt-3 mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy">{process.numero_processo}</h1>
          <p className="text-sm text-foreground/50">
            <Link href={`/admin/clients/${process.client_id}`} className="font-medium text-navy hover:underline">
              {process.clients?.name}
            </Link>{" "}
            · {PROCESS_AREA_LABEL[process.area]} · {process.profiles?.full_name ?? "Sem responsável"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={process.status} />
          <Link
            href={`/admin/processes/${process.id}/edit`}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy hover:text-navy-foreground"
          >
            Editar
          </Link>
          <ConfirmSubmitButton
            action={deleteProcessAction}
            hiddenFields={{ id: process.id }}
            confirmMessage={`Excluir o processo "${process.numero_processo}"?`}
            label="Excluir"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-status-danger hover:bg-status-danger hover:text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Detalhes</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/50">Vara / Tribunal</dt>
              <dd className="text-foreground">{process.vara_tribunal ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/50">Fase</dt>
              <dd className="text-foreground">{process.fase ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/50">Cadastrado em</dt>
              <dd className="text-foreground">{new Date(process.created_at).toLocaleDateString("pt-BR")}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy">Documentos</h2>
            <Link href={`/admin/documents/new?processId=${process.id}`} className="text-xs font-medium text-navy hover:underline">
              + Anexar documento
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {documents.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum documento anexado.</p>}
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{d.title}</p>
                  <p className="text-xs text-foreground/50">{new Date(d.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                {d.downloadUrl && (
                  <a href={d.downloadUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-navy hover:underline">
                    Baixar
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
