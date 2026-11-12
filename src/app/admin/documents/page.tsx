import { BarraFiltros } from "@/components/ui/barra-filtros";
import Link from "next/link";
import { Download, FileText, Pencil, Plus } from "lucide-react";
import { DriveIcon } from "@/components/ui/drive-icon";
import { DriveSyncSection } from "@/components/drive/drive-sync-section";
import { listClients } from "@/lib/data/clients";
import { listDocumentsPage } from "@/lib/data/documents";
import { Pager } from "@/components/ui/pager";
import { DOCUMENT_CATEGORY_LABEL } from "@/lib/document-category";
import { deleteDocumentAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { exigirPermissao } from "@/lib/dal";
import { ListaVazia } from "@/components/ui/empty-state";

const DOCS_PER_PAGE = 25;

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; busca?: string; categoria?: string; cliente?: string; ordem?: string }>;
}) {
  const { permissoes } = await exigirPermissao("documentos");
  const { page: pageParam, busca, categoria, cliente, ordem } = await searchParams;
  const [docsPage, todosClientes] = await Promise.all([
    listDocumentsPage(
      { semAtas: !permissoes.atas, busca, categoria: categoria === "ata" && !permissoes.atas ? undefined : categoria, clientId: cliente },
      { page: Number(pageParam) || 1, pageSize: DOCS_PER_PAGE, ordem: ordem === "titulo" || ordem === "antigos" ? ordem : undefined }
    ),
    listClients(),
  ]);
  const documents = docsPage.items;
  const clients = todosClientes.map((c) => ({ id: c.id, name: c.name }));
  const filtrosQs = new URLSearchParams(Object.entries({ busca, categoria, cliente, ordem }).filter(([, v]) => v) as [string, string][]);

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Arquivos · Documentos</p>
          <h1 className="page-title">Documentos</h1>
          <p className="text-sm text-muted">
            {docsPage.total} {docsPage.total === 1 ? "documento armazenado" : "documentos armazenados"}
          </p>
        </div>
        <Link
          href={`/admin/documents/new${cliente ? `?clientId=${cliente}` : ""}`}
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
        ordenacao={{
          opcoes: [
            { valor: "", rotulo: "Mais recentes" },
            { valor: "antigos", rotulo: "Mais antigos" },
            { valor: "titulo", rotulo: "Nome (A a Z)" },
          ],
        }}
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
                <td colSpan={6}>
                  <ListaVazia
                    icon={FileText}
                    filtrado={!!(busca || categoria || cliente)}
                    titulo="Nenhum documento armazenado ainda"
                    dica="Envie o primeiro documento ou ligue a pasta do cliente no Google Drive logo acima."
                    acao={{ href: "/admin/documents/new", rotulo: "Enviar documento" }}
                  />
                </td>
              </tr>
            )}
            {documents.map((d) => (
              <tr key={d.id}>
                <td className="px-5 py-3 font-medium text-foreground">{d.title}</td>
                <td className="px-5 py-3 text-foreground/70">{d.client_id ? <Link href={`/admin/clients/${d.client_id}`} className="hover:text-foreground hover:underline">{d.clients?.name}</Link> : d.clients?.name}</td>
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
