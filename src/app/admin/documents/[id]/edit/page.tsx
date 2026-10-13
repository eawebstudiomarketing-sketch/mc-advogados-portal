import { notFound } from "next/navigation";
import { getDocument } from "@/lib/data/documents";
import { EditDocumentForm } from "./edit-document-form";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("documentos");
  const { id } = await params;
  const document = await getDocument(id);
  if (!document) notFound();

  return (
    <div>
      <BackButton fallback="/admin/documents" />

      <h1 className="mt-3 mb-6 page-title">Editar documento</h1>
      <p className="mb-4 max-w-md text-xs text-muted">
        Só dá pra editar título e categoria — pra trocar o arquivo, exclua este documento e envie um novo.
      </p>

      <EditDocumentForm document={document} />
    </div>
  );
}
