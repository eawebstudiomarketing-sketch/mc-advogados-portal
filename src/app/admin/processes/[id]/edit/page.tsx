import { notFound } from "next/navigation";
import { getProcess } from "@/lib/data/processes";
import { EditProcessForm } from "./edit-process-form";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";

export default async function EditProcessPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("processos");
  const { id } = await params;
  const process = await getProcess(id);
  if (!process) notFound();

  return (
    <div>
      <BackButton fallback="/admin/processes" />

      <h1 className="mt-3 mb-6 page-title">Editar processo</h1>

      <EditProcessForm process={process} />
    </div>
  );
}
