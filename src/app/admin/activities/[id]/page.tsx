import { Download } from "lucide-react";
import { BackButton } from "@/components/nav/back-button";
import { nomeResponsavel } from "@/lib/responsavel-nome";
import { DriveIcon } from "@/components/ui/drive-icon";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActivity } from "@/lib/data/activities";
import { listDocuments } from "@/lib/data/documents";
import { AttachExistingDocument } from "@/components/drive/attach-existing-document";
import { deleteActivityAction } from "../actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { formatDate } from "@/lib/mock-data";
import { exigirPermissao } from "@/lib/dal";

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("atividades");
  const { id } = await params;

  const activity = await getActivity(id);
  if (!activity) notFound();

  const documents = await listDocuments({ activityId: id });

  return (
    <div>
      <BackButton fallback="/admin/activities" />

      <div className="mt-3 mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{activity.title}</h1>
          <p className="text-sm text-muted">
            {ACTIVITY_TYPE_LABEL[activity.type]} ·{" "}
            {activity.client_id ? (
              <Link href={`/admin/clients/${activity.client_id}`} className="font-medium text-navy-3 underline-offset-2 hover:underline">
                {activity.clients?.name}
              </Link>
            ) : (
              "Sem cliente (tarefa interna)"
            )}{" "}
            · {nomeResponsavel(activity) ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={activity.status} />
          <Link
            href={`/admin/activities/${activity.id}/edit`}
            className="ui-btn-secondary px-3 py-1.5 text-xs"
          >
            Editar
          </Link>
          <ConfirmSubmitButton
            action={deleteActivityAction}
            hiddenFields={{ id: activity.id }}
            confirmMessage={`Excluir a atividade "${activity.title}"?`}
            label="Excluir"
            icon="trash"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ui-card p-5">
          <h2 className="section-title">Detalhes</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Prazo</dt>
              <dd className="text-foreground">
                {activity.deadline ? formatDate(activity.deadline) : "Sem prazo"}
                {activity.hora ? ` às ${activity.hora.slice(0, 5)}` : ""}
                {activity.categoria === "audiencia" ? " · Audiência" : activity.categoria === "prazo" ? " · Prazo processual" : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Criada em</dt>
              <dd className="text-foreground">{new Date(activity.created_at).toLocaleDateString("pt-BR")}</dd>
            </div>
          </dl>
          {activity.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/70">{activity.description}</p>
          )}
        </div>

        <div className="ui-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Documentos</h2>
            {activity.client_id && (
              <Link href={`/admin/documents/new?activityId=${activity.id}`} className="ui-link">
                + Anexar documento
              </Link>
            )}
          </div>
          {activity.client_id && <AttachExistingDocument clientId={activity.client_id} activityId={activity.id} />}
          {!activity.client_id && (
            <p className="mt-3 text-xs text-muted">
              Esta atividade não tem cliente vinculado, então ainda não é possível anexar documentos a ela.
            </p>
          )}
          <ul className="mt-3 divide-y divide-border">
            {documents.length === 0 && <p className="py-3 text-sm text-muted">Nenhum documento anexado.</p>}
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{d.title}</p>
                  <p className="text-xs text-muted">{new Date(d.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                {d.drive_file_id && (
                <a
                  href={`https://drive.google.com/file/d/${d.drive_file_id}/view`}
                  target="_blank"
                  rel="noreferrer"
                  className="icon-btn" aria-label="Abrir no Google Drive" data-tip="Abrir no Google Drive"
                ><DriveIcon /></a>
              )}
              {d.downloadUrl && (
                  <a href={d.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Baixar" data-tip="Baixar"><Download aria-hidden /></a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
