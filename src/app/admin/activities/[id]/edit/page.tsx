import { getEscritorioConfig } from "@/lib/data/escritorio";
import { notFound } from "next/navigation";
import { getActivity } from "@/lib/data/activities";
import { listResponsaveis } from "@/lib/data/responsaveis";
import { listEtiquetas } from "@/lib/data/etiquetas";
import { BackButton } from "@/components/nav/back-button";
import { EditActivityForm } from "./edit-activity-form";
import { exigirPermissao } from "@/lib/dal";

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("atividades");
  const { id } = await params;
  const [activity, responsaveis, etiquetas] = await Promise.all([getActivity(id), listResponsaveis(), listEtiquetas()]);
  if (!activity) notFound();

  return (
    <div>
      <BackButton fallback={`/admin/activities/${id}`} />

      <h1 className="mt-3 mb-6 page-title">Editar atividade</h1>

      <EditActivityForm etiquetas={etiquetas} activity={activity} responsaveis={responsaveis} areas={(await getEscritorioConfig()).areas} />
    </div>
  );
}
