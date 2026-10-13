import { notFound } from "next/navigation";
import { getContract } from "@/lib/data/contracts";
import { EditContractForm } from "./edit-contract-form";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("contratos");
  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) notFound();

  return (
    <div>
      <BackButton fallback="/admin/contracts" />

      <h1 className="mt-3 mb-6 page-title">Editar contrato</h1>

      <EditContractForm contract={contract} />
    </div>
  );
}
