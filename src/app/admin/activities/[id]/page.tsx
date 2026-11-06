import { BackButton } from "@/components/nav/back-button";
import { nomeResponsavel } from "@/lib/responsavel-nome";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getActivity } from "@/lib/data/activities";
import { anexosDaAtividade } from "@/lib/anexos-atividade";
import { AnexosAtividade } from "@/components/atividade/anexos-atividade";
import { AttachExistingDocument } from "@/components/drive/attach-existing-document";
import { deleteActivityAction } from "../actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { formatDate } from "@/lib/mock-data";
import { exigirPermissao } from "@/lib/dal";
import { Comentarios } from "@/components/atividade/comentarios";
import { CobrancaDocumento } from "@/components/atividade/cobranca-documento";
import { EtiquetasEditor } from "@/components/atividade/etiquetas";
import { listEtiquetas } from "@/lib/data/etiquetas";
import { listResponsaveis } from "@/lib/data/responsaveis";

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await exigirPermissao("atividades");
  const { id } = await params;

  const activity = await getActivity(id);
  if (!activity) notFound();

  const [anexos, etiquetas, responsaveis] = await Promise.all([anexosDaAtividade(id, profile.id), listEtiquetas(), listResponsaveis()]);
  const envolvidos = (activity.envolvidos ?? []).map((e) => responsaveis.find((r) => r.id === e)?.nome).filter(Boolean);

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

      <div className="mb-4">
        <EtiquetasEditor todas={etiquetas} defaultValue={activity.etiquetas ?? []} activityId={activity.id} />
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
            {envolvidos.length > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Envolvidos</dt>
                <dd className="text-right text-foreground">{envolvidos.join(", ")}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Criada em</dt>
              <dd className="text-foreground">{new Date(activity.created_at).toLocaleDateString("pt-BR")}</dd>
            </div>
          </dl>
          {activity.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/70">{activity.description}</p>
          )}
          <CobrancaDocumento atividadeId={activity.id} />
        </div>

        <div className="ui-card p-5">
          {/* anexos (06/11/2026): qualquer arquivo, com ou sem cliente na atividade */}
          <h2 className="section-title mb-3">Anexos</h2>
          <AnexosAtividade activityId={activity.id} temCliente={!!activity.client_id} inicial={anexos} />
          {activity.client_id && <AttachExistingDocument clientId={activity.client_id} activityId={activity.id} />}
        </div>
      </div>

      <div className="ui-card mt-4 p-0">
        <Comentarios activityId={activity.id} />
      </div>
    </div>
  );
}
