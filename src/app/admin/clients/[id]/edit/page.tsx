import { BackButton } from "@/components/nav/back-button";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/data/clients";
import { exigirPermissao } from "@/lib/dal";
import { EditClientForm } from "./edit-client-form";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("clientes", "editar_cliente");
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  return (
    <div>
      <BackButton fallback={`/admin/clients/${id}`} />

      <h1 className="mt-3 mb-6 page-title">Editar cliente</h1>

      <EditClientForm client={client} />
    </div>
  );
}
