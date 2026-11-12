import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { ContractForm } from "./contract-form";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";

export default async function NewContractPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams;
  await exigirPermissao("contratos");
  const clients = await listClients();

  return (
    <div>
      <BackButton fallback="/admin/contracts" />

      <h1 className="mt-3 mb-6 page-title">Novo contrato</h1>

      {clients.length === 0 ? (
        <p className="max-w-md ui-card p-6 text-sm text-muted">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy-3 underline-offset-2 hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de criar um contrato.
        </p>
      ) : (
        <ContractForm clients={clients} clientId={clientId} />
      )}
    </div>
  );
}
