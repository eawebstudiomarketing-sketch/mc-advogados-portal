import { notFound } from "next/navigation";
import { getProcess } from "@/lib/data/processes";
import { EditProcessForm } from "./edit-process-form";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";
import { listClients } from "@/lib/data/clients";
import { listStaff } from "@/lib/data/team";

export default async function EditProcessPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("processos");
  const { id } = await params;
  const [process, clientes, equipe] = await Promise.all([getProcess(id), listClients(), listStaff()]);
  if (!process) notFound();

  return (
    <div>
      <BackButton fallback="/admin/processes" />

      <h1 className="mt-3 mb-6 page-title">Editar processo</h1>

      <EditProcessForm process={process} clientes={clientes.map((c) => ({ id: c.id, name: c.name }))} equipe={equipe.map((p) => ({ id: p.id, full_name: p.full_name }))} />
    </div>
  );
}
