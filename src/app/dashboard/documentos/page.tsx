import { CheckCircle2, CircleDashed, Download, FileText, FolderOpen } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { listDocuments } from "@/lib/data/documents";
import { pedidosDoCliente } from "@/lib/pedidos-documentos";
import { DOCUMENT_CATEGORY_LABEL } from "@/lib/document-category";
import { EmptyState } from "@/components/ui/empty-state";
import { EnvioDocumento } from "./envio";

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export default async function ClientDocumentsPage() {
  const profile = await requireRole(["client"]);
  const clientId = profile.client_id!;
  const [pedidos, documentos] = await Promise.all([pedidosDoCliente(clientId), listDocuments({ clientId })]);
  const pendentes = pedidos.filter((p) => !p.enviado).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Documentos</h1>
        <p className="mt-1 text-sm text-muted">Envie o que o escritório pediu e acesse os documentos do seu caso.</p>
      </div>

      {pedidos.length > 0 && (
        <section className="ui-card mb-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Documentos pedidos pelo escritório</h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${pendentes ? "bg-status-pending-bg text-status-pending" : "bg-status-success-bg text-status-success"}`}>
              {pendentes ? `${pendentes} pendente(s)` : "Tudo enviado"}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eceef2]">
            <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${Math.round(((pedidos.length - pendentes) / pedidos.length) * 100)}%` }} />
          </div>
          <ul className="mt-3 divide-y divide-border">
            {pedidos.map((p) => (
              <li key={p.item} className="flex items-center gap-3 py-3">
                {p.enviado ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-status-success" aria-hidden />
                ) : (
                  <CircleDashed className="h-5 w-5 shrink-0 text-status-pending" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{p.item}</p>
                  <p className="text-xs text-muted">{p.enviado && p.enviadoEm ? `Enviado em ${dataBR(p.enviadoEm)}` : "Aguardando envio"}</p>
                </div>
                <EnvioDocumento item={p.item} rotulo={p.enviado ? "Enviar de novo" : "Enviar"} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ui-card mb-6 p-5">
        <h2 className="section-title">Enviar outro documento</h2>
        <p className="mb-3 text-xs text-muted">PDF, Word, planilha ou foto, até 4 MB.</p>
        <EnvioDocumento livre rotulo="Escolher arquivo" />
      </section>

      <section className="ui-card p-5">
        <h2 className="section-title">
          Seus documentos <span className="text-muted tabular-nums">· {documentos.length}</span>
        </h2>
        {documentos.length === 0 ? (
          <EmptyState icon={FolderOpen} title="Nenhum documento ainda" compact />
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {documentos.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{d.title}</p>
                  <p className="text-xs text-muted">
                    {DOCUMENT_CATEGORY_LABEL[d.category]} · {dataBR(d.created_at)}
                  </p>
                </div>
                {d.downloadUrl && (
                  <a href={d.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Baixar" data-tip="Baixar">
                    <Download aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
