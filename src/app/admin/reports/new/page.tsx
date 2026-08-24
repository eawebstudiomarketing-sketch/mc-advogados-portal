import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { requireRole } from "@/lib/dal";
import { ReportForm } from "./report-form";

export default async function NewReportPage() {
  await requireRole(["admin"]);
  const clients = await listClients();

  return (
    <div>
      <Link href="/admin/reports" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para relatórios
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Gerar relatório</h1>

      {clients.length === 0 ? (
        <p className="max-w-md rounded-xl border border-border bg-surface p-6 text-sm text-foreground/60 shadow-sm">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de gerar um relatório.
        </p>
      ) : (
        <ReportForm clients={clients} />
      )}
    </div>
  );
}
