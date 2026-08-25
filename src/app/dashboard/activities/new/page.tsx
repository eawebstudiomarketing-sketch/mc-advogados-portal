import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { ActivityForm } from "./activity-form";

export default async function NewOwnActivityPage() {
  await requireRole(["client"]);

  return (
    <div>
      <Link href="/dashboard/activities" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para atividades
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Nova atividade</h1>

      <ActivityForm />
    </div>
  );
}
