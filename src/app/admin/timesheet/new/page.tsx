import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { TimeEntryForm } from "./time-entry-form";

export default async function NewTimeEntryPage() {
  const clients = await listClients();

  return (
    <div>
      <Link href="/admin/timesheet" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para timesheet
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Lançar horas</h1>

      {clients.length === 0 ? (
        <p className="max-w-md rounded-xl border border-border bg-surface p-6 text-sm text-foreground/60 shadow-sm">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de lançar horas.
        </p>
      ) : (
        <TimeEntryForm clients={clients} />
      )}
    </div>
  );
}
