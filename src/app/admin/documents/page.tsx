import { BarraFiltros } from "@/components/ui/barra-filtros";
import Link from "next/link";
import { Download, Pencil, Plus } from "lucide-react";
import { DriveIcon } from "@/components/ui/drive-icon";
import { DriveSyncSection } from "@/components/drive/drive-sync-section";
import { listClients } from "@/lib/data/clients";
import { listDocumentsPage } from "@/lib/data/documents";
import { Pager } from "@/components/ui/pager";
import { DOCUMENT_CATEGORY_LABEL } from "@/lib/document-category";
import { deleteDocumentAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { exigirPermissao } from "@/lib/dal";

const DOCS_PER_PAGE = 25;

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; busca?: string; categoria?: string; cliente?: string }>;
}) {
  const { permissoes } = await exigirPermissao("documentos");
  const { page: pageParam, busca, categoria, cliente } = await searchParams;
  const docsPage = await listDocumentsPage(
    { semAtas: !permissoes.atas, busca, categoria: categoria === "ata" && !permissoes.atas ? undefined : categoria, clientId: cliente },
    { page: Number(pageParam) || 1, pageSize: DOCS_PER_PAGE }
  );
  const documents = docsPage.items;
  const clients = (await listClients()).map((c) => ({ id: c.id, name: c.name }));
  const filtrosQs = new URLSearchParams(Object.entries({ busca, categoria, cliente }).filter(([, v]) => v) as [string, string][]);

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Arquivo · Documentos</p>
          <h1 className="page-title">Documentos</h1>
          <p className="text-sm text-muted">
            {docsPage.total} {docsPage.total === 1 ? "documento armazenado" : "documentos armazenados"}
          </p>
        </div>
        <Link
          href="/admin/documents/new"
          className="ui-btn"
        >
          <Plus className="h-4 w-4" aria-hidden /> Enviar documento
        </Link>
      </div>

      <DriveSyncSection clients={clients} />

      <BarraFiltros
        filtros={[
          { tipo: "busca", nome: "busca", rotulo: "Buscar pelo nome do documento" },
          { tipo: "select", nome: "cliente", rotulo: "Cliente", todos: "Todos os clientes", opcoes: clients.map((c) => ({ valor: c.id, rotulo: c.name })) },
          {
            tipo: "select",
            nome: "categoria",
            rotulo: "Categoria",
            todos: "Todas as categorias",
            opcoes: Object.entries(DOCUMENT_CATEGORY_LABEL)
              .filter(([v]) => v !== "ata" || permissoes.atas)
              .map(([valor, rotulo]) => ({ valor, rotulo })),
          },
        ]}
      />

      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-5 py-2.5 font-medium">Documento</th>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Categoria</th>
              <th className="px-5 py-2.5 font-medium">Enviado por</th>
              <th className="px-5 py-2.5 font-medium">Data</th>
              <th className="px-5 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {documents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted">
                  Nenhum documento armazenado ainda.
                </td>
              </tr>
            )}
            {documents.map((d) => (
              <tr key={d.id}>
                <td className="px-5 py-3 font-medium text-foreground">{d.title}</td>
                <td className="px-5 py-3 text-foreground/70">{d.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">{DOCUMENT_CATEGORY_LABEL[d.category]}</td>
                <td className="px-5 py-3 text-foreground/70">{d.profiles?.full_name}</td>
                <td className="px-5 py-3 text-foreground/70">
                  {new Date(d.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-0.5">
                    {d.drive_file_id && (
                <a
                  href={`https://drive.google.com/file/d/${d.drive_file_id}/view`}
                  target="_blank"
                  rel="noreferrer"
                  className="icon-btn" aria-label="Abrir no Google Drive" data-tip="Abrir no Google Drive"
                ><DriveIcon /></a>
              )}
              {d.downloadUrl && (
                      <a
                        href={d.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="icon-btn" aria-label="Baixar" data-tip="Baixar"
                      ><Download aria-hidden /></a>
                    )}
                    <Link href={`/admin/documents/${d.id}/edit`} className="icon-btn" aria-label="Editar" data-tip="Editar"><Pencil aria-hidden /></Link>
                    <ConfirmSubmitButton
                      action={deleteDocumentAction}
                      hiddenFields={{ id: d.id, file_path: d.file_path }}
                      confirmMessage={`Excluir o documento "${d.title}"? O arquivo também será apagado.`}
                      label="Excluir"
                      icon="trash"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager
        page={docsPage.page}
        totalPages={docsPage.totalPages}
        total={docsPage.total}
        pageSize={DOCS_PER_PAGE}
        hrefFor={(n) => `/admin/documents?page=${n}${filtrosQs.size ? `&${filtrosQs}` : ""}`}
      />
    </div>
  );
}
