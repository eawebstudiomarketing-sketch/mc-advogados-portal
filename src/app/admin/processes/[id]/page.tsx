import { Download, Star } from "lucide-react";
import { DriveIcon } from "@/components/ui/drive-icon";
import Link from "next/link";
import { EtiquetasAstrea, TextoAstrea } from "@/components/ui/texto-astrea";
import { notFound } from "next/navigation";
import { getProcess } from "@/lib/data/processes";
import { listDocuments } from "@/lib/data/documents";
import { listClients } from "@/lib/data/clients";
import { listAndamentosDoProcesso } from "@/lib/data/andamentos";
import { AttachExistingDocument } from "@/components/drive/attach-existing-document";
import { deleteProcessAction, vincularClienteProcessoAction } from "../actions";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PROCESS_AREA_LABEL } from "@/lib/process-area";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";
import { listPublicacoesDoProcesso, STATUS_PUBLICACAO, type PublicacaoStatus } from "@/lib/data/publicacoes";

type Parte = { nome: string; papel: string; polo: "ativo" | "passivo" | "outro" };
const TIPO: Record<string, string> = { andamento: "Andamento", publicacao: "Publicação", tarefa: "Tarefa", compromisso: "Compromisso", nota: "Anotação" };
const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });

export default async function ProcessDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ todos?: string; imp?: string }> }) {
  await exigirPermissao("processos");
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  const process = await getProcess(id);
  if (!process) notFound();

  const [documents, publicacoes, andamentosTodos, clientes] = await Promise.all([
    process.client_id ? listDocuments({ processId: id }) : Promise.resolve([]),
    listPublicacoesDoProcesso(id),
    listAndamentosDoProcesso(id, 1000),
    process.client_id ? Promise.resolve([]) : listClients(),
  ]);
  const soImportantes = sp.imp === "1";
  const filtrados = andamentosTodos.filter((a) => (!soImportantes || a.importante) && (sp.todos === "1" || a.tipo !== "tarefa"));
  const andamentos = sp.todos === "1" ? filtrados : filtrados.slice(0, 40);
  const partes = (Array.isArray(process.partes) ? process.partes : []) as Parte[];
  const ativos = partes.filter((p) => p.polo === "ativo");
  const passivos = partes.filter((p) => p.polo === "passivo");
  const outros = partes.filter((p) => p.polo === "outro");
  const hrefAnd = (m: { todos?: boolean; imp?: boolean }) => {
    const q = new URLSearchParams();
    if (m.todos ?? sp.todos === "1") q.set("todos", "1");
    if (m.imp ?? soImportantes) q.set("imp", "1");
    const s = q.toString();
    return `/admin/processes/${id}${s ? `?${s}` : ""}#andamentos`;
  };

  return (
    <div>
      <BackButton fallback="/admin/processes" />

      <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Processo {process.numero_processo}</p>
          <h1 className="page-title">{process.titulo ?? process.numero_processo}</h1>
          <p className="mt-1 text-sm text-muted">
            {process.client_id ? (
              <Link href={`/admin/clients/${process.client_id}`} className="font-medium text-navy-3 underline-offset-2 hover:underline">
                {process.clients?.name}
              </Link>
            ) : (
              <span>{process.cliente_nome ? `${process.cliente_nome} (sem ficha no portal)` : "Sem cliente"}</span>
            )}{" "}
            · {PROCESS_AREA_LABEL[process.area]} · {process.profiles?.full_name ?? process.responsavel_nome ?? "Sem responsável"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={process.status} />
          <Link href={`/admin/processes/${process.id}/edit`} className="ui-btn-secondary px-3 py-1.5 text-xs">
            Editar
          </Link>
          <ConfirmSubmitButton
            action={deleteProcessAction}
            hiddenFields={{ id: process.id }}
            confirmMessage={`Excluir o processo "${process.numero_processo}"?`}
            label="Excluir"
            icon="trash"
          />
        </div>
      </div>

      {!process.client_id && (
        <form action={vincularClienteProcessoAction} className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border-strong px-4 py-3 text-sm">
          <input type="hidden" name="id" value={process.id} />
          <span className="text-muted">Este processo veio do Astrea sem ficha de cliente. Ligar a um cliente:</span>
          <select name="client_id" className="ui-input w-auto min-w-[220px] !py-1.5 text-sm" defaultValue="" aria-label="Cliente">
            <option value="">Escolha o cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="submit" className="ui-btn-secondary px-3 py-1.5 text-xs">
            Ligar
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="ui-card p-5">
          <h2 className="section-title">Capa do processo</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              ["Juízo / Tribunal", process.vara_tribunal],
              ["Classe / Assunto", process.classe],
              ["Distribuído em", process.distribuido_em ? process.distribuido_em.split("-").reverse().join("/") : null],
              ["Valor da causa", process.valor_causa ? process.valor_causa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : null],
              ["Instância", process.instancia ? `${process.instancia}º grau` : null],
              ["Fase", process.fase],
              ["Último andamento", process.ultimo_andamento_em ? dataBR(process.ultimo_andamento_em) : null],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="flex justify-between gap-3">
                <dt className="shrink-0 text-muted">{rotulo}</dt>
                <dd className="text-right text-foreground">{valor ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {partes.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
              {[
                ["Polo ativo", ativos],
                ["Polo passivo", passivos],
                ...(outros.length ? [["Outros", outros] as const] : []),
              ].map(([rotulo, lista]) => (
                <div key={rotulo as string}>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">{rotulo as string}</p>
                  <ul className="mt-1 space-y-1">
                    {(lista as Parte[]).map((p, i) => (
                      <li key={i} className="text-foreground">
                        {p.nome} <span className="text-xs text-muted">· {p.papel}</span>
                      </li>
                    ))}
                    {(lista as Parte[]).length === 0 && <li className="text-muted">—</li>}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ui-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Documentos</h2>
            {process.client_id && (
              <Link href={`/admin/documents/new?processId=${process.id}`} className="ui-link">
                + Anexar documento
              </Link>
            )}
          </div>
          {process.client_id ? (
            <>
              <AttachExistingDocument clientId={process.client_id} processId={process.id} />
              <ul className="mt-3 divide-y divide-border">
                {documents.length === 0 && <p className="py-3 text-sm text-muted">Nenhum documento anexado.</p>}
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm text-foreground">{d.title}</p>
                      <p className="text-xs text-muted">{new Date(d.created_at).toLocaleDateString("pt-BR")}</p>
                    </div>
                    {d.drive_file_id && (
                      <a href={`https://drive.google.com/file/d/${d.drive_file_id}/view`} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Abrir no Google Drive" data-tip="Abrir no Google Drive">
                        <DriveIcon />
                      </a>
                    )}
                    {d.downloadUrl && (
                      <a href={d.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Baixar" data-tip="Baixar">
                        <Download aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-3 text-sm text-muted">Ligue o processo a um cliente para anexar documentos.</p>
          )}
        </div>
      </div>

      <div id="andamentos" className="mt-4 ui-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Andamentos</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href={hrefAnd({ imp: !soImportantes })} className={`rounded-full border px-3 py-1 ${soImportantes ? "border-navy bg-navy text-white" : "border-border text-foreground/75 hover:border-border-strong"}`}>
              Só importantes
            </Link>
            <Link href={hrefAnd({ todos: sp.todos !== "1" })} className={`rounded-full border px-3 py-1 ${sp.todos === "1" ? "border-navy bg-navy text-white" : "border-border text-foreground/75 hover:border-border-strong"}`}>
              Tudo (inclui tarefas)
            </Link>
          </div>
        </div>
        {andamentos.length === 0 ? (
          <p className="py-3 text-sm text-muted">Nenhum andamento registrado ainda.</p>
        ) : (
          <ol className="mt-4 space-y-3 border-l-2 border-border pl-4">
            {andamentos.map((a) => (
              <li key={a.id} className="relative">
                <span className={`absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full ${a.importante ? "bg-gold" : "bg-border-strong"}`} aria-hidden />
                <p className="text-xs text-muted">
                  {dataBR(a.data)} · {TIPO[a.tipo] ?? a.tipo}
                  {a.importante && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 font-medium text-status-pending">
                      <Star className="h-3 w-3" aria-hidden /> importante
                    </span>
                  )}
                  {a.situacao === "novo" && <span className="ml-1.5 font-medium text-navy-3">· não tratado</span>}
                  {a.responsavel_nome && <span> · Responsável: {a.responsavel_nome}</span>}
                  {" "}
                  <EtiquetasAstrea etiquetas={a.etiquetas} />
                </p>
                <p className="text-sm text-foreground/90">
                  <TextoAstrea texto={a.descricao_html ?? a.descricao} />
                </p>
              </li>
            ))}
          </ol>
        )}
        {sp.todos !== "1" && filtrados.length > 40 && (
          <Link href={hrefAnd({ todos: true })} className="ui-link mt-3 inline-block text-sm">
            Ver todos os {andamentosTodos.length} registros
          </Link>
        )}
      </div>

      <div className="mt-4 ui-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Publicações no Diário</h2>
          <Link href={`/admin/publicacoes?q=${encodeURIComponent(process.numero_processo)}&status=todas`} className="ui-link">
            Abrir em Publicações
          </Link>
        </div>
        {publicacoes.length === 0 ? (
          <p className="py-3 text-sm text-muted">Nenhuma publicação recebida para este processo desde que o monitor começou.</p>
        ) : (
          <ol className="mt-3 space-y-4 border-l-2 border-border pl-4">
            {publicacoes.map((p) => (
              <li key={p.id} className="relative">
                <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-gold" aria-hidden />
                <p className="text-xs text-muted">
                  {p.data_disponibilizacao.split("-").reverse().join("/")} · {p.tribunal} · {p.tipo_comunicacao} ·{" "}
                  <span className={p.status === "nao_tratada" ? "font-medium text-status-pending" : ""}>{STATUS_PUBLICACAO[p.status as PublicacaoStatus]}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{p.orgao}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-sm text-foreground/85">
                    <span className="line-clamp-2 inline whitespace-pre-line">{p.texto}</span>
                  </summary>
                  <p className="mt-2 rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-line text-foreground/85">{p.texto}</p>
                </details>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
