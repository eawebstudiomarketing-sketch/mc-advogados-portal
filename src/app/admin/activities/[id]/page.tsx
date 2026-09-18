import Link from "next/link";
import { notFound } from "next/navigation";
import { getActivity } from "@/lib/data/activities";
import { listDocuments } from "@/lib/data/documents";
import { deleteActivityAction } from "../actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { formatDate } from "@/lib/mock-data";

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const activity = await getActivity(id);
  if (!activity) notFound();

  const documents = await listDocuments({ activityId: id });

  return (
    <div>
      <Link href="/admin/activities" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para atividades
      </Link>

      <div className="mt-3 mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy">{activity.title}</h1>
          <p className="text-sm text-foreground/50">
            {ACTIVITY_TYPE_LABEL[activity.type]} ·{" "}
            {activity.client_id ? (
              <Link href={`/admin/clients/${activity.client_id}`} className="font-medium text-navy hover:underline">
                {activity.clients?.name}
              </Link>
            ) : (
              "Sem cliente (tarefa interna)"
            )}{" "}
            · {activity.profiles?.full_name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={activity.status} />
          <Link
            href={`/admin/activities/${activity.id}/edit`}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy hover:text-navy-foreground"
          >
            Editar
          </Link>
          <ConfirmSubmitButton
            action={deleteActivityAction}
            hiddenFields={{ id: activity.id }}
            confirmMessage={`Excluir a atividade "${activity.title}"?`}
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
              <dt className="text-foreground/50">Prazo</dt>
              <dd className="text-foreground">{activity.deadline ? formatDate(activity.deadline) : "Sem prazo"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground/50">Criada em</dt>
              <dd className="text-foreground">{new Date(activity.created_at).toLocaleDateString("pt-BR")}</dd>
            </div>
          </dl>
          {activity.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/70">{activity.description}</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy">Documentos</h2>
            {activity.client_id && (
              <Link href={`/admin/documents/new?activityId=${activity.id}`} className="text-xs font-medium text-navy hover:underline">
                + Anexar documento
              </Link>
            )}
          </div>
          {!activity.client_id && (
            <p className="mt-3 text-xs text-foreground/40">
              Esta atividade não tem cliente vinculado, então ainda não é possível anexar documentos a ela.
            </p>
          )}
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
