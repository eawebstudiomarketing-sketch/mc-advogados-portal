"use client";

import { ChecklistAtividade } from "./checklist";
import { CobrancaDocumento } from "./cobranca-documento";
import { HistoricoRegistro } from "@/components/ui/historico-registro";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  ExternalLink,
  Paperclip,
  Pencil,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { AnexosAtividade } from "./anexos-atividade";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_STATUSES, type ActivityStatus } from "@/lib/activity-status";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";
import { formatDate } from "@/lib/mock-data";
import { bulkArchiveActivitiesAction, saveActivityInlineAction, updateActivityStatusAction } from "@/app/admin/activities/actions";
import {
  attachDocumentInlineAction,
  deleteActivityInlineAction,
  getActivityDetailAction,
  type AtividadeDetalhe,
} from "@/app/admin/activities/modal-actions";
import { ResponsavelSelect } from "./responsavel-select";
import { EnvolvidosSelect } from "./envolvidos-select";
import { EtiquetasEditor } from "./etiquetas";
import { Comentarios } from "./comentarios";
import { AvisarCliente } from "./avisar-cliente";
import { CampoPrazo } from "@/components/atividade/campo-prazo";

// Mini tela da atividade: abre no meio da tela, por cima de qualquer lista ou
// quadro, sem trocar de página. Fecha com Esc, clique fora ou no X.

type Abrir = (id: string, opcoes?: { editar?: boolean }) => void;
const AbrirCtx = createContext<Abrir>(() => {});

export function AtividadeModalProvider({ children }: { children: React.ReactNode }) {
  const [aberta, setAberta] = useState<{ id: string; editar: boolean } | null>(null);

  const abrir = useCallback<Abrir>((id, opcoes) => setAberta({ id, editar: !!opcoes?.editar }), []);
  return (
    <AbrirCtx.Provider value={abrir}>
      {children}
      {aberta &&
        createPortal(
          <AtividadeModal key={aberta.id} id={aberta.id} editarAoAbrir={aberta.editar} onClose={() => setAberta(null)} />,
          document.body
        )}
    </AbrirCtx.Provider>
  );
}

export const useAbrirAtividade = () => useContext(AbrirCtx);

/** Link para a atividade: clique normal abre a mini tela; Ctrl/Cmd+clique abre a página. */
export function AtividadeLink({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const abrir = useAbrirAtividade();
  return (
    <a
      href={`/admin/activities/${id}`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        abrir(id);
      }}
    >
      {children}
    </a>
  );
}

function Campo({ icone: Icone, rotulo, children }: { icone: typeof Tag; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{rotulo}</p>
        <div className="text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

function AtividadeModal({ id, editarAoAbrir, onClose }: { id: string; editarAoAbrir: boolean; onClose: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<AtividadeDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(editarAoAbrir);
  const [excluir, setExcluir] = useState(false);
  const [anexar, setAnexar] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  // tipo escolhido no editar (Audiência mostra o horário na hora)
  const [tipoEd, setTipoEd] = useState<{ id: string; tipo: string } | null>(null);
  const tipoAtual = d && tipoEd?.id === d.id ? tipoEd.tipo : d?.type;
  const comHora = !!d && (tipoAtual === "audiencia" || d.categoria === "audiencia" || !!d.hora);
  const [pending, start] = useTransition();
  const painel = useRef<HTMLDivElement>(null);


  const carregar = useCallback(async () => {
    const r = await getActivityDetailAction(id);
    if (r.ok) setD(r.data);
    else setErro(r.error);
  }, [id]);

  useEffect(() => {
    let vivo = true;
    getActivityDetailAction(id).then((r) => {
      if (!vivo) return;
      if (r.ok) setD(r.data);
      else setErro(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [id]);

  // Esc fecha (ou sai da edição/confirmação); trava a rolagem da página
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (excluir) setExcluir(false);
      else if (editando) setEditando(false);
      else onClose();
    };
    window.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [onClose, editando, excluir]);

  useEffect(() => {
    painel.current?.focus();
  }, []);

  /** Roda uma ação, recarrega a mini tela e a página de trás. */
  function executar(fn: () => Promise<string | null>, depois?: () => void) {
    setMsg(null);
    start(async () => {
      const e = await fn();
      if (e) return setMsg(e);
      depois?.();
      await carregar();
      router.refresh();
    });
  }

  function mudarStatus(status: ActivityStatus) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", status);
    setD((x) => (x ? { ...x, status } : x));
    executar(async () => {
      await updateActivityStatusAction(fd);
      return null;
    });
  }

  function salvar(form: HTMLFormElement) {
    const fd = new FormData(form);
    executar(async () => (await saveActivityInlineAction(fd)).error, () => setEditando(false));
  }

  function arquivar() {
    if (!d) return;
    executar(async () => {
      const r = await bulkArchiveActivitiesAction([id], !d.archived_at);
      return r.ok ? null : r.error;
    });
  }

  function apagar() {
    setMsg(null);
    start(async () => {
      const r = await deleteActivityInlineAction(id);
      if (r.error) return setMsg(r.error);
      router.refresh();
      onClose();
    });
  }

  function anexarDoc() {
    if (!anexar) return;
    executar(async () => (await attachDocumentInlineAction(id, anexar)).error, () => setAnexar(""));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <button type="button" aria-label="Fechar" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-navy-2/45 backdrop-blur-[2px] animate-page" />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label={d?.title ?? "Atividade"}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl outline-none animate-enter sm:rounded-2xl"
      >
        {/* cabeçalho */}
        <div className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            {d ? (
              <>
                <p className="text-xs text-muted">
                  {ACTIVITY_TYPE_LABEL[d.type]} ·{" "}
                  {d.pode.verCliente ? (
                    <Link href={`/admin/clients/${d.client_id}`} onClick={onClose} className="font-medium text-navy-3 underline-offset-2 hover:underline">
                      {d.cliente ?? "Cliente"}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground/70">{d.cliente ?? "Cliente"}</span>
                  )}
                  {d.archived_at && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium">Arquivada</span>}
                </p>
                <h2 className="mt-0.5 text-lg font-semibold leading-snug text-foreground">{d.title}</h2>
              </>
            ) : (
              <div className="space-y-2 py-1">
                <div className="skeleton h-3 w-32 rounded" />
                <div className="skeleton h-5 w-64 rounded" />
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="icon-btn -mr-2" aria-label="Fechar" data-tip="Fechar (Esc)">
            <X aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {erro && <p className="text-sm text-status-danger">{erro}</p>}
          {!d && !erro && (
            <div className="space-y-3">
              <div className="skeleton h-10 rounded-lg" />
              <div className="skeleton h-24 rounded-lg" />
            </div>
          )}

          {d && !editando && (
            <>
              <div className="mb-5">
                <p className="eyebrow mb-1.5">Etiquetas</p>
                <EtiquetasEditor
                  key={d.id}
                  todas={d.etiquetasTodas}
                  defaultValue={d.etiquetas}
                  activityId={d.id}
                  onMudou={(ids) => setD((x) => (x ? { ...x, etiquetas: ids } : x))}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo icone={Tag} rotulo="Status">
                  <select
                    value={d.status}
                    onChange={(e) => mudarStatus(e.target.value as ActivityStatus)}
                    disabled={pending}
                    aria-label="Status"
                    className="mt-0.5 rounded-lg border border-border bg-background px-2 py-1 text-sm focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  >
                    {ACTIVITY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ACTIVITY_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo icone={CalendarDays} rotulo="Prazo">
                  {d.deadline ? `${formatDate(d.deadline)}${d.hora ? ` às ${d.hora.slice(0, 5)}` : ""}` : <span className="text-muted">Sem prazo</span>}
                </Campo>
                <Campo icone={UserRound} rotulo="Responsável">
                  {d.responsavel ?? <span className="text-muted">—</span>}
                </Campo>
                {d.envolvidos.length > 0 && (
                  <Campo icone={UserRound} rotulo="Envolvidos">
                    {d.envolvidos.map((id) => d.responsaveis.find((r) => r.id === id)?.nome).filter(Boolean).join(", ")}
                  </Campo>
                )}
                <Campo icone={CalendarDays} rotulo="Criada em">
                  {new Date(d.created_at).toLocaleDateString("pt-BR")}
                </Campo>
              </div>

              {d.status === "concluida" && d.client_id && (
                <AvisarCliente
                  key={d.id}
                  atividadeId={d.id}
                  avisadoEm={d.cliente_avisado_em}
                  podeSalvarModelo={d.pode.salvarModeloAviso}
                  onAvisou={(iso) => setD((x) => (x ? { ...x, cliente_avisado_em: iso } : x))}
                />
              )}

              <div className="mt-5">
                <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Descrição</p>
                {d.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{d.description}</p>
                ) : (
                  <p className="mt-1 text-sm text-muted">Sem descrição.</p>
                )}
              </div>

              <ChecklistAtividade key={`ck-${d.id}`} atividadeId={d.id} inicial={d.checklist} />

              <CobrancaDocumento key={`cob-${d.id}`} atividadeId={d.id} />

              {/* anexos (06/11/2026): qualquer arquivo, em qualquer atividade (com ou sem cliente) */}
              <div className="mt-5 rounded-xl border border-border">
                <p className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
                  <Paperclip className="h-4 w-4 text-muted" aria-hidden /> Anexos
                </p>
                <div className="px-4 py-3">
                  <AnexosAtividade key={d.id} activityId={d.id} temCliente={!!d.client_id} inicial={d.documentos} />
                </div>
                {d.docsDoCliente.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
                    <select
                      value={anexar}
                      onChange={(e) => setAnexar(e.target.value)}
                      aria-label="Documento do cliente para anexar"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                    >
                      <option value="">Anexar um documento que já está no cliente…</option>
                      {d.docsDoCliente.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.title}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={anexarDoc} disabled={!anexar || pending} className="ui-btn-secondary px-3 py-1.5 text-xs">
                      Anexar
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <Comentarios activityId={d.id} />
              </div>
              <HistoricoRegistro eventos={d.historico} className="mt-4" />
            </>
          )}

          {d && editando && (
            <form
              id="form-atividade-modal"
              onSubmit={(e) => {
                e.preventDefault();
                salvar(e.currentTarget);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="id" value={d.id} />
              <div>
                <label htmlFor="m-title" className="ui-label">Título</label>
                <input id="m-title" name="title" required defaultValue={d.title} className="ui-input" autoFocus />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="m-status" className="ui-label">Status</label>
                  <select id="m-status" name="status" defaultValue={d.status} className="ui-input">
                    {ACTIVITY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ACTIVITY_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="m-type" className="ui-label">Tipo</label>
                  <select id="m-type" name="type" defaultValue={d.type} onChange={(e) => setTipoEd({ id: d.id, tipo: e.target.value })} className="ui-input">
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACTIVITY_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  {/* horário só na atividade com hora marcada (audiência) ou que já tem um (05/11/2026) */}
                  <label htmlFor="m-deadline" className="ui-label">{comHora ? "Prazo e horário" : "Prazo"}</label>
                  <div className="flex gap-2">
                    <CampoPrazo activityId={d.id} deadline={d.deadline} podeMudar={d.pode.mudarPrazo} pedido={d.pedidoPrazo} inputId="m-deadline" />
                    {comHora && <input name="hora" type="time" defaultValue={d.hora?.slice(0, 5) ?? ""} aria-label="Horário" className="ui-input max-w-32" />}
                  </div>
                </div>
                <div>
                  <label htmlFor="m-resp" className="ui-label">Responsável</label>
                  <ResponsavelSelect id="m-resp" responsaveis={d.responsaveis} defaultValue={d.responsavel_id} clientId={d.client_id} />
                </div>
              </div>
              <div>
                <p className="ui-label">Envolvidos</p>
                <EnvolvidosSelect responsaveis={d.responsaveis} defaultValue={d.envolvidos} />
              </div>
              <div>
                <label htmlFor="m-desc" className="ui-label">Descrição</label>
                <textarea id="m-desc" name="description" rows={4} defaultValue={d.description ?? ""} className="ui-input" />
              </div>
            </form>
          )}

          {msg && <p className="mt-4 text-sm text-status-danger">{msg}</p>}
        </div>

        {/* rodapé com as ações */}
        {d && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/60 px-5 py-3 sm:px-6">
            {editando ? (
              <>
                {/* key própria + type="button": o clique em "Editar" não pode virar envio deste botão */}
                <button
                  key="salvar"
                  type="button"
                  onClick={() => (document.getElementById("form-atividade-modal") as HTMLFormElement | null)?.requestSubmit()}
                  disabled={pending}
                  className="ui-btn px-4 py-2 text-sm"
                >
                  {pending ? "Salvando..." : "Salvar"}
                </button>
                <button key="cancelar" type="button" onClick={() => setEditando(false)} className="ui-btn-secondary px-4 py-2 text-sm">
                  Cancelar
                </button>
              </>
            ) : excluir ? (
              <>
                <p className="mr-auto text-sm text-foreground">Excluir esta atividade? Os documentos anexados vão para a Lixeira.</p>
                <button type="button" onClick={() => setExcluir(false)} className="ui-btn-secondary px-3 py-2 text-sm">
                  Cancelar
                </button>
                <button type="button" onClick={apagar} disabled={pending} className="ui-btn bg-status-danger px-3 py-2 text-sm hover:bg-status-danger/90">
                  {pending ? "Excluindo..." : "Excluir"}
                </button>
              </>
            ) : (
              <>
                <button key="editar" type="button" onClick={() => setEditando(true)} className="ui-btn inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                  <Pencil className="h-4 w-4" aria-hidden /> Editar
                </button>
                <button type="button" onClick={arquivar} disabled={pending} className="ui-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-sm">
                  {d.archived_at ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
                  {d.archived_at ? "Desarquivar" : "Arquivar"}
                </button>
                {d.pode.excluir && (
                  <button type="button" onClick={() => setExcluir(true)} className="icon-btn icon-btn-danger" aria-label="Excluir" data-tip="Excluir">
                    <Trash2 aria-hidden />
                  </button>
                )}
                <Link href={`/admin/activities/${d.id}`} onClick={onClose} className="icon-btn ml-auto" aria-label="Abrir em página inteira" data-tip="Abrir em página inteira">
                  <ExternalLink aria-hidden />
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
