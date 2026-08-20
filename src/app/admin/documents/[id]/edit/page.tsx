import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument } from "@/lib/data/documents";
import { EditDocumentForm } from "./edit-document-form";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await getDocument(id);
  if (!document) notFound();

  return (
    <div>
      <Link href="/admin/documents" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para documentos
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Editar documento</h1>
      <p className="mb-4 max-w-md text-xs text-foreground/40">
        Só dá pra editar título e categoria — pra trocar o arquivo, exclua este documento e envie um novo.
      </p>

      <EditDocumentForm document={document} />
    </div>
  );
}
