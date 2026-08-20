import Link from "next/link";
import { listDocuments } from "@/lib/data/documents";
import { DOCUMENT_CATEGORY_LABEL } from "@/lib/document-category";

export default async function AdminDocumentsPage() {
  const documents = await listDocuments();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Documentos</h1>
          <p className="text-sm text-foreground/50">
            {documents.length} {documents.length === 1 ? "documento armazenado" : "documentos armazenados"}
          </p>
        </div>
        <Link
          href="/admin/documents/new"
          className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90"
        >
          Enviar documento
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Documento</th>
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Categoria</th>
              <th className="px-5 py-3 font-medium">Enviado por</th>
              <th className="px-5 py-3 font-medium">Data</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {documents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-foreground/50">
                  Nenhum documento armazenado ainda.
                </td>
              </tr>
            )}
            {documents.map((d) => (
              <tr key={d.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{d.title}</td>
                <td className="px-5 py-3 text-foreground/70">{d.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">{DOCUMENT_CATEGORY_LABEL[d.category]}</td>
                <td className="px-5 py-3 text-foreground/70">{d.profiles?.full_name}</td>
                <td className="px-5 py-3 text-foreground/70">
                  {new Date(d.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-5 py-3 text-right">
                  {d.downloadUrl && (
                    <a
                      href={d.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-navy hover:underline"
                    >
                      Baixar
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
