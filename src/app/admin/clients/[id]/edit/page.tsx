import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient } from "@/lib/data/clients";
import { requireRole } from "@/lib/dal";
import { EditClientForm } from "./edit-client-form";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  return (
    <div>
      <Link href={`/admin/clients/${id}`} className="text-xs font-medium text-navy hover:underline">
        ← Voltar para o cliente
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Editar cliente</h1>

      <EditClientForm client={client} />
    </div>
  );
}
