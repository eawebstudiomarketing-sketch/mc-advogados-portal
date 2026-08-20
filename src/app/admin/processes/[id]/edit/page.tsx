import Link from "next/link";
import { notFound } from "next/navigation";
import { getProcess } from "@/lib/data/processes";
import { EditProcessForm } from "./edit-process-form";

export default async function EditProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const process = await getProcess(id);
  if (!process) notFound();

  return (
    <div>
      <Link href="/admin/processes" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para processos
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Editar processo</h1>

      <EditProcessForm process={process} />
    </div>
  );
}
