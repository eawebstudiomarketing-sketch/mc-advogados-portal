import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { NewClientForm } from "./new-client-form";

export default async function NewClientPage() {
  await requireRole(["admin"]);

  return (
    <div>
      <Link href="/admin/clients" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para clientes
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Novo cliente</h1>

      <NewClientForm />
    </div>
  );
}
