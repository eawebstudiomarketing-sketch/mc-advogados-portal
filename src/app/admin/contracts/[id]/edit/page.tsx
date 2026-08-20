import Link from "next/link";
import { notFound } from "next/navigation";
import { getContract } from "@/lib/data/contracts";
import { EditContractForm } from "./edit-contract-form";

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) notFound();

  return (
    <div>
      <Link href="/admin/contracts" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para contratos
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Editar contrato</h1>

      <EditContractForm contract={contract} />
    </div>
  );
}
