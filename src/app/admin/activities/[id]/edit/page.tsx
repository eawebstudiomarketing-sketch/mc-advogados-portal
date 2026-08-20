import Link from "next/link";
import { notFound } from "next/navigation";
import { getActivity } from "@/lib/data/activities";
import { EditActivityForm } from "./edit-activity-form";

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const activity = await getActivity(id);
  if (!activity) notFound();

  return (
    <div>
      <Link href="/admin/activities" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para atividades
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Editar atividade</h1>

      <EditActivityForm activity={activity} />
    </div>
  );
}
