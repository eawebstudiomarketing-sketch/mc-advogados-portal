import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { exigirPermissao } from "@/lib/dal";
import { ReportForm } from "./report-form";
import { BackButton } from "@/components/nav/back-button";

export default async function NewReportPage() {
  await exigirPermissao("relatorios");
  const clients = await listClients();

  return (
    <div>
      <BackButton fallback="/admin/reports" />

      <h1 className="mt-3 mb-6 page-title">Gerar relatório</h1>

      {clients.length === 0 ? (
        <p className="max-w-md ui-card p-6 text-sm text-muted">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy-3 underline-offset-2 hover:underline">
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
