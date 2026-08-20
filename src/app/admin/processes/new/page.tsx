import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { ProcessForm } from "./process-form";

export default async function NewProcessPage() {
  const clients = await listClients();

  return (
    <div>
      <Link href="/admin/processes" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para processos
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Novo processo</h1>

      {clients.length === 0 ? (
        <p className="max-w-md rounded-xl border border-border bg-surface p-6 text-sm text-foreground/60 shadow-sm">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de abrir um processo.
        </p>
      ) : (
        <ProcessForm clients={clients} />
      )}
    </div>
  );
}
