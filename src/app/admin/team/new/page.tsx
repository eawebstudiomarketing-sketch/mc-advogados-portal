import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { NewStaffForm } from "./new-staff-form";

export default async function NewStaffPage() {
  await requireRole(["admin"]);

  return (
    <div>
      <Link href="/admin/team" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para equipe
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Convidar pessoa</h1>

      <NewStaffForm />
    </div>
  );
}
