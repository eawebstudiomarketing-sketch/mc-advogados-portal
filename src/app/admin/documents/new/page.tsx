import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { getActivity } from "@/lib/data/activities";
import { getProcess } from "@/lib/data/processes";
import { DocumentForm } from "./document-form";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; activityId?: string; processId?: string }>;
}) {
  await exigirPermissao("documentos");
  const { clientId, activityId, processId } = await searchParams;

  const [clients, activity, process] = await Promise.all([
    listClients(),
    activityId ? getActivity(activityId) : Promise.resolve(null),
    processId ? getProcess(processId) : Promise.resolve(null),
  ]);

  const backHref = activity
    ? `/admin/activities/${activity.id}`
    : process
      ? `/admin/processes/${process.id}`
      : "/admin/documents";
  const scopeLabel = activity
    ? `${activity.clients?.name ?? "Sem cliente"} (atividade: ${activity.title})`
    : process
      ? `${process.clients?.name} (processo: ${process.numero_processo})`
      : undefined;

  return (
    <div>
      <BackButton fallback={backHref} />

      <h1 className="mt-3 mb-6 page-title">Enviar documento</h1>

      {activityId && !activity?.clients ? (
        <p className="max-w-md ui-card p-6 text-sm text-muted">
          Esta atividade não tem cliente vinculado, então ainda não é possível anexar documentos a ela.
        </p>
      ) : clients.length === 0 ? (
        <p className="max-w-md ui-card p-6 text-sm text-muted">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy-3 underline-offset-2 hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de enviar um documento.
        </p>
      ) : (
        <DocumentForm
          clients={clients}
          activityId={activity?.id}
          processId={process?.id}
          clientId={clientId}
          scopeLabel={scopeLabel}
          returnTo={backHref}
        />
      )}
    </div>
  );
}
