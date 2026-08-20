import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { ContractForm } from "./contract-form";

export default async function NewContractPage() {
  const clients = await listClients();

  return (
    <div>
      <Link href="/admin/contracts" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para contratos
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Novo contrato</h1>

      {clients.length === 0 ? (
        <p className="max-w-md rounded-xl border border-border bg-surface p-6 text-sm text-foreground/60 shadow-sm">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de criar um contrato.
        </p>
      ) : (
        <ContractForm clients={clients} />
      )}
    </div>
  );
}
