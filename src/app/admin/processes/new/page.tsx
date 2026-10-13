import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { ProcessForm } from "./process-form";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";

export default async function NewProcessPage({ searchParams }: { searchParams: Promise<{ numero?: string }> }) {
  await exigirPermissao("processos");
  const [clients, { numero }] = await Promise.all([listClients(), searchParams]);

  return (
    <div>
      <BackButton fallback="/admin/processes" />

      <h1 className="mt-3 mb-6 page-title">Novo processo</h1>

      {clients.length === 0 ? (
        <p className="max-w-md ui-card p-6 text-sm text-muted">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy-3 underline-offset-2 hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de abrir um processo.
        </p>
      ) : (
        <ProcessForm clients={clients} numeroInicial={numero} />
      )}
    </div>
  );
}
