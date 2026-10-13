import { Download } from "lucide-react";
import { DriveIcon } from "@/components/ui/drive-icon";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProcess } from "@/lib/data/processes";
import { listDocuments } from "@/lib/data/documents";
import { AttachExistingDocument } from "@/components/drive/attach-existing-document";
import { deleteProcessAction } from "../actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PROCESS_AREA_LABEL } from "@/lib/process-area";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";
import { listPublicacoesDoProcesso, STATUS_PUBLICACAO, type PublicacaoStatus } from "@/lib/data/publicacoes";

export default async function ProcessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("processos");
  const { id } = await params;

  const process = await getProcess(id);
  if (!process) notFound();

  const [documents, publicacoes] = await Promise.all([listDocuments({ processId: id }), listPublicacoesDoProcesso(id)]);

  return (
    <div>
      <BackButton fallback="/admin/processes" />

      <div className="mt-3 mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{process.numero_processo}</h1>
          <p className="text-sm text-muted">
            <Link href={`/admin/clients/${process.client_id}`} className="font-medium text-navy-3 underline-offset-2 hover:underline">
              {process.clients?.name}
            </Link>{" "}
            · {PROCESS_AREA_LABEL[process.area]} · {process.profiles?.full_name ?? "Sem responsável"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={process.status} />
          <Link
            href={`/admin/processes/${process.id}/edit`}
            className="ui-btn-secondary px-3 py-1.5 text-xs"
          >
            Editar
          </Link>
          <ConfirmSubmitButton
            action={deleteProcessAction}
            hiddenFields={{ id: process.id }}
            confirmMessage={`Excluir o processo "${process.numero_processo}"?`}
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
              <dt className="text-muted">Vara / Tribunal</dt>
              <dd className="text-foreground">{process.vara_tribunal ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Fase</dt>
              <dd className="text-foreground">{process.fase ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Cadastrado em</dt>
              <dd className="text-foreground">{new Date(process.created_at).toLocaleDateString("pt-BR")}</dd>
            </div>
          </dl>
        </div>

        <div className="ui-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Documentos</h2>
            <Link href={`/admin/documents/new?processId=${process.id}`} className="ui-link">
              + Anexar documento
            </Link>
          </div>
          <AttachExistingDocument clientId={process.client_id} processId={process.id} />
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
      <div className="mt-4 ui-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Publicações no Diário</h2>
          <Link href={`/admin/publicacoes?q=${encodeURIComponent(process.numero_processo)}&status=todas`} className="ui-link">
            Abrir em Publicações
          </Link>
        </div>
        {publicacoes.length === 0 ? (
          <p className="py-3 text-sm text-muted">Nenhuma publicação recebida para este processo desde que o monitor começou.</p>
        ) : (
          <ol className="mt-3 space-y-4 border-l-2 border-border pl-4">
            {publicacoes.map((p) => (
              <li key={p.id} className="relative">
                <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-gold" aria-hidden />
                <p className="text-xs text-muted">
                  {p.data_disponibilizacao.split("-").reverse().join("/")} · {p.tribunal} · {p.tipo_comunicacao} ·{" "}
                  <span className={p.status === "nao_tratada" ? "font-medium text-status-pending" : ""}>{STATUS_PUBLICACAO[p.status as PublicacaoStatus]}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{p.orgao}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-sm text-foreground/85"><span className="line-clamp-2 inline whitespace-pre-line">{p.texto}</span></summary>
                  <p className="mt-2 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-line text-foreground/85">{p.texto}</p>
                </details>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
