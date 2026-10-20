import Link from "next/link";
import { listProcesses } from "@/lib/data/processes";
import { listEtiquetas } from "@/lib/data/etiquetas";
import { PROCESS_AREA_LABEL } from "@/lib/process-area";
import { notFound } from "next/navigation";
import { ArrowRight, ClipboardList, Download, Eye, FileSignature, FileText, Hash, KeyRound, LayoutGrid, Lightbulb, ListChecks, Mail, NotebookPen, Pencil, Sparkles, Gavel } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { DriveIcon } from "@/components/ui/drive-icon";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getClient } from "@/lib/data/clients";
import { getHandoff } from "@/lib/data/handoff";
import { listActivities } from "@/lib/data/activities";
import { listAtas, listDocumentsPage } from "@/lib/data/documents";
import { Pager } from "@/components/ui/pager";
import { DriveSyncSection } from "@/components/drive/drive-sync-section";
import { listContracts } from "@/lib/data/contracts";
import { listOnboardings } from "@/lib/data/onboardings";
import { getClientPortalUser, listDesignados, listStaff } from "@/lib/data/team";
import { removeClientPortalUserAction } from "@/app/admin/team/actions";
import { exigirPermissao, ehSuperAdmin } from "@/lib/dal";
import { DOCUMENT_CATEGORY_LABEL } from "@/lib/document-category";
import { formatCurrency } from "@/lib/mock-data";
import { PortalAccessInvite } from "./portal-access";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { HandoffCard } from "./handoff-card";
import { handoffPreenchido } from "@/lib/handoff-schema";
import { AtasCard } from "./atas-card";
import { ActivitiesView } from "@/app/admin/activities/activities-view";
import { DeleteClient } from "./delete-client";
import { toggleArchiveClientAction } from "../actions";
import { Archive, ArchiveRestore } from "lucide-react";
import { GerarDemandas } from "./gerar-demandas";
import { ReportsTab } from "./reports-tab";
import { listReports } from "@/lib/data/reports";
import { BarChart3 } from "lucide-react";
import { DemandsSection } from "@/app/admin/onboarding/[id]/demands-section";
import { listClientDemandDrafts } from "@/lib/data/onboarding-demand-drafts";
import { BackButton } from "@/components/nav/back-button";
import { EquipeDoCliente } from "./equipe-do-cliente";
import { WhatsappCard } from "./whatsapp-card";
import type { PermChave } from "@/lib/permissoes";
import { listResponsaveis, responsavelDoPerfil } from "@/lib/data/responsaveis";

const DOCS_PER_PAGE = 10;

const ABAS = [
  { id: "geral", label: "Visão geral", icon: LayoutGrid },
  { id: "atividades", label: "Atividades", icon: ListChecks },
  { id: "processos", label: "Processos", icon: Gavel },
  { id: "documentos", label: "Documentos", icon: FileText },
  { id: "atas", label: "ATAs", icon: NotebookPen },
  { id: "onboarding", label: "Onboarding", icon: ClipboardList },
  { id: "demandas", label: "Demandas", icon: Lightbulb },
  { id: "relatorios", label: "Relatórios", icon: BarChart3 },
  { id: "acesso", label: "Acesso", icon: KeyRound },
] as const;
type Aba = (typeof ABAS)[number]["id"];

const dataBR = (iso: string) => new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("pt-BR");

// Ficha do cliente em abas (out/2026). Horas e financeiro saíram da ficha (os
// dados e os menus continuam); contratos ficam junto dos documentos; processos
// voltaram como aba própria (pedido de 20/10).
export default async function AdminClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ docs?: string; aba?: string }>;
}) {
  const { id } = await params;
  const { docs: docsParam, aba: abaParam } = await searchParams;

  const { profile, permissoes: perm } = await exigirPermissao("clientes");
  // designar advogados é do admin máximo; o cartão do WhatsApp, de quem tem a permissão
  const isAdmin = ehSuperAdmin(profile);

  const [client, activities, docsPage, contracts, portalUser, onboardings, atas, drafts, relatorios, ficha] = await Promise.all([
    getClient(id),
    listActivities({ clientId: id }),
    listDocumentsPage({ clientId: id, semAtas: true }, { page: Number(docsParam) || 1, pageSize: DOCS_PER_PAGE }),
    perm.contratos ? listContracts({ clientId: id }) : Promise.resolve([]),
    getClientPortalUser(id),
    listOnboardings({ clientId: id }),
    perm.atas ? listAtas(id) : Promise.resolve([]),
    perm.demandas ? listClientDemandDrafts(id) : Promise.resolve([]),
    perm.relatorios ? listReports({ clientId: id }) : Promise.resolve([]),
    perm.ficha_handoff ? getHandoff(id) : Promise.resolve({ handoff: null, triagem: null, handoffUpdatedAt: null }),
  ]);
  const [processos, etiquetas] = await Promise.all([perm.processos ? listProcesses({ clientId: id }) : Promise.resolve([]), listEtiquetas()]);
  const [equipe, designados] = isAdmin ? await Promise.all([listStaff(), listDesignados(id)]) : [[], []];
  if (!client) notFound();
  // responsável das demandas (aba Demandas): qualquer pessoa da equipe
  const [responsaveis, meuResponsavel] =
    abaParam === "demandas" && perm.demandas ? await Promise.all([listResponsaveis(), responsavelDoPerfil(profile.id)]) : [[], null];

  // abas que este advogado pode ver (admin: todas)
  const PERM_DA_ABA: Partial<Record<Aba, PermChave>> = {
    atividades: "atividades",
    processos: "processos",
    documentos: "documentos",
    atas: "atas",
    onboarding: "onboarding",
    demandas: "demandas",
    relatorios: "relatorios",
    acesso: "acesso_portal",
  };
  const abas = ABAS.filter((a) => !PERM_DA_ABA[a.id] || perm[PERM_DA_ABA[a.id]!]);
  const pedida = abas.find((a) => a.id === abaParam)?.id;
  const aba: Aba = pedida ?? (docsParam && abas.some((a) => a.id === "documentos") ? "documentos" : "geral");
  const documents = docsPage.items;
  const contar = (status: string) => activities.filter((a) => a.status === status).length;
  const pendentes = drafts.filter((d) => d.status === "rascunho").length;
  const contagem: Partial<Record<Aba, number>> = {
    atividades: activities.length,
    processos: processos.length,
    documentos: docsPage.total + contracts.length,
    atas: atas.length,
    onboarding: onboardings.length,
    demandas: pendentes,
    relatorios: relatorios.length,
  };
  const hrefAba = (a: Aba) => `/admin/clients/${client.id}${a === "geral" ? "" : `?aba=${a}`}`;
  const temBase = handoffPreenchido(ficha.handoff) || !!ficha.triagem?.trim();
  const sigla = client.name.replace(/[^A-Za-zÀ-ú0-9 ]/g, "").trim().slice(0, 2).toUpperCase();

  return (
    <div>
      <BackButton fallback="/admin/clients" className="mb-3" />

      {/* cabeçalho do cliente */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy text-base font-semibold text-gold-2 shadow-md">
            {sigla}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title truncate">{client.name}</h1>
              <StatusBadge status={client.active ? "ativo" : "inativo"} />
              {client.archived_at && <StatusBadge status="arquivado" label="Arquivado" />}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" aria-hidden />
                {client.tipo_pessoa} · {client.documento}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {client.email_contact}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {perm.editar_cliente && (
          <form action={toggleArchiveClientAction}>
            <input type="hidden" name="client_id" value={client.id} />
            <input type="hidden" name="arquivar" value={client.archived_at ? "0" : "1"} />
            <button
              type="submit"
              className="icon-btn h-9 w-9 border border-border-strong bg-surface"
              aria-label={client.archived_at ? "Desarquivar cliente" : "Arquivar cliente"}
              data-tip={client.archived_at ? "Desarquivar cliente" : "Arquivar cliente"}
            >
              {client.archived_at ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
            </button>
          </form>
          )}
          {perm.excluir && <DeleteClient clientId={client.id} clientName={client.name} />}
          {perm.editar_cliente && (
          <Link href={`/admin/clients/${client.id}/edit`} className="icon-btn h-9 w-9 border border-border-strong bg-surface" aria-label="Editar cliente" data-tip="Editar cliente">
            <Pencil aria-hidden />
          </Link>
          )}
          {perm.onboarding && perm.gerar_ia && (
          <Link
            href={`/admin/onboarding/new?clientId=${client.id}`}
            className="ui-btn"
            title={temBase ? "O Gemini lê a ficha de handoff e monta as perguntas para este cliente" : "Preencha a ficha de handoff primeiro"}
          >
            <Sparkles className="h-4 w-4 text-gold-2" aria-hidden /> Onboarding com IA
          </Link>
          )}
        </div>
      </div>

      {/* abas */}
      <nav aria-label="Seções do cliente" className="-mx-4 mt-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {abas.map((a) => {
            const on = a.id === aba;
            const Icone = a.icon;
            const n = contagem[a.id];
            return (
              <li key={a.id}>
                <Link
                  href={hrefAba(a.id)}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={`relative inline-flex items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm transition-colors ${
                    on ? "font-medium text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <Icone className={`h-4 w-4 ${on ? "text-gold" : ""}`} aria-hidden />
                  {a.label}
                  {n ? (
                    <span
                      className={`rounded-full px-1.5 text-[11px] font-medium tabular-nums ${
                        a.id === "demandas" ? "bg-gold-soft text-gold-ink" : on ? "bg-navy/[0.08] text-navy-3" : "bg-surface-2 text-muted"
                      }`}
                    >
                      {n}
                    </span>
                  ) : null}
                  {on && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-navy" aria-hidden />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div key={aba} className="mt-6 animate-page">
        {aba === "geral" && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="A fazer" value={String(contar("aberta"))} tone="pending" href={hrefAba("atividades")} />
              <StatCard label="Em andamento" value={String(contar("em_andamento"))} tone="info" href={hrefAba("atividades")} />
              <StatCard label="Concluídas" value={String(contar("concluida"))} tone="success" href={hrefAba("atividades")} />
            </div>
            {isAdmin && <EquipeDoCliente clientId={client.id} equipe={equipe.filter((p) => p.role === "advogado" || (p.role === "admin" && !p.super_admin)).map((p) => ({ id: p.id, nome: p.full_name, ativo: p.ativo }))} designados={designados} />}
            {perm.whatsapp && <WhatsappCard clientId={client.id} grupos={client.whatsapp_grupos ?? []} numeros={client.whatsapp_numeros ?? []} />}
            {perm.ficha_handoff && (
              <HandoffCard
                clientId={client.id}
                handoff={ficha.handoff}
                updatedAt={ficha.handoffUpdatedAt}
                triagemAntiga={ficha.triagem}
              />
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                { a: "atas" as Aba, t: "ATAs", n: atas.length, d: atas[0] ? `Última: ${atas[0].title}` : "Nenhuma ainda", icon: NotebookPen },
                { a: "onboarding" as Aba, t: "Onboarding", n: onboardings.length, d: onboardings[0] ? `Feito em ${dataBR(onboardings[0].created_at)}` : "Ainda não feito", icon: ClipboardList },
                { a: "demandas" as Aba, t: "Demandas para revisar", n: pendentes, d: pendentes ? "Rascunhos da IA aguardando você" : "Nada pendente", icon: Lightbulb },
              ].filter((c) => abas.some((x) => x.id === c.a)).map((c) => (
                <Link
                  key={c.a}
                  href={hrefAba(c.a)}
                  scroll={false}
                  className="ui-card group flex items-center gap-3 p-4 transition-[box-shadow,border-color] duration-200 hover:border-border-strong hover:shadow-md"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy/[0.07] text-navy-3">
                    <c.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {c.t} <span className="text-muted tabular-nums">· {c.n}</span>
                    </p>
                    <p className="truncate text-xs text-muted">{c.d}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        )}

        {aba === "atividades" && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Atividades do cliente</h2>
              <Link href={`/admin/activities/new?clientId=${client.id}`} className="ui-link">
                + Nova atividade
              </Link>
            </div>
            <ActivitiesView etiquetas={etiquetas} activities={activities} podeExcluir={perm.excluir} />
          </section>
        )}

        {aba === "processos" && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Processos do cliente</h2>
              <Link href={`/admin/processes/new?cliente=${client.id}`} className="ui-link">
                + Novo processo
              </Link>
            </div>
            {processos.length === 0 ? (
              <div className="ui-card flex flex-col items-center gap-1 py-12 text-center">
                <Gavel className="h-6 w-6 text-muted" aria-hidden />
                <p className="font-display text-base font-bold text-foreground">Nenhum processo deste cliente.</p>
                <p className="text-xs text-muted">Cadastre um em &ldquo;+ Novo processo&rdquo;; ele já vem ligado a {client.name}.</p>
              </div>
            ) : (
              <ol className="ui-card divide-y divide-border overflow-hidden">
                {processos.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/processes/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm font-medium text-navy">{p.numero_processo}</span>
                        <span className="block truncate text-xs text-muted">
                          {[PROCESS_AREA_LABEL[p.area], p.vara_tribunal, p.fase].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {p.profiles?.full_name && <span className="hidden text-xs text-foreground/70 sm:block">{p.profiles.full_name}</span>}
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {aba === "documentos" && (
          <section className="ui-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="section-title">Documentos e contratos</h2>
              <Link href={`/admin/documents/new?clientId=${client.id}`} className="ui-link">
                + Adicionar documento
              </Link>
            </div>
            <div className="mt-3">
              <DriveSyncSection clientId={client.id} />
            </div>
            {documents.length === 0 && contracts.length === 0 ? (
              <EmptyState icon={FileText} title="Nenhum documento ou contrato" compact />
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {docsPage.page === 1 &&
                  contracts.map((c) => (
                    <li key={`c-${c.id}`} className="flex items-center gap-3 py-2.5">
                      <FileSignature className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">
                          <Etiqueta>Contrato</Etiqueta> {c.title}
                        </p>
                        <p className="text-xs text-muted">
                          Desde {dataBR(c.start_date)}
                          {c.value ? ` · ${formatCurrency(Number(c.value))}` : ""}
                        </p>
                      </div>
                      <Link href={`/admin/contracts/${c.id}/edit`} className="icon-btn" aria-label="Ver" data-tip="Ver"><Eye aria-hidden /></Link>
                    </li>
                  ))}
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        <Etiqueta>{DOCUMENT_CATEGORY_LABEL[d.category]}</Etiqueta> {d.title}
                      </p>
                      <p className="text-xs text-muted">{dataBR(d.created_at)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {d.drive_file_id && (
                        <a
                          href={`https://drive.google.com/file/d/${d.drive_file_id}/view`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Abrir no Google Drive"
                          data-tip="Abrir no Google Drive"
                          className="icon-btn"
                        >
                          <DriveIcon />
                        </a>
                      )}
                      {d.downloadUrl && (
                        <a
                          href={d.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Baixar"
                          data-tip="Baixar"
                          className="icon-btn"
                        >
                          <Download aria-hidden />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Pager
              page={docsPage.page}
              totalPages={docsPage.totalPages}
              total={docsPage.total}
              pageSize={DOCS_PER_PAGE}
              hrefFor={(n) => `/admin/clients/${client.id}?aba=documentos&docs=${n}`}
            />
          </section>
        )}

        {aba === "atas" && (
          <AtasCard
            clientId={client.id}
            atas={atas.map((a) => ({
              id: a.id,
              title: a.title,
              meeting_date: a.meeting_date,
              created_at: a.created_at,
              downloadUrl: a.downloadUrl,
            }))}
          />
        )}

        {aba === "onboarding" && (
          <section className="ui-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="section-title">Onboarding</h2>
              <div className="flex items-center gap-2">
                <Link href={`/admin/onboarding/new?clientId=${client.id}&modo=padrao`} className="ui-btn-secondary">
                  Perguntas padrão
                </Link>
                <Link href={`/admin/onboarding/new?clientId=${client.id}`} className="ui-btn">
                  <Sparkles className="h-4 w-4 text-gold-2" aria-hidden /> Gerar com IA
                </Link>
              </div>
            </div>
            {!temBase && (
              <p className="mt-3 rounded-lg bg-gold-soft px-3 py-2 text-[13px] text-gold-ink">
                Preencha a <Link href={`/admin/clients/${client.id}/handoff`} className="font-medium underline underline-offset-2">ficha de handoff</Link> para a IA montar as perguntas.
              </p>
            )}
            {onboardings.length === 0 ? (
              <EmptyState icon={ClipboardList} title="Onboarding ainda não feito" compact />
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {onboardings.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-3">
                    <ClipboardList className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">Feito em {dataBR(o.created_at)}</p>
                      <p className="text-xs text-muted">
                        {o.profiles?.full_name ?? "—"}
                        {o.questions ? " · perguntas da IA" : " · perguntas padrão"}
                      </p>
                    </div>
                    <Link href={`/admin/onboarding/${o.id}`} className="icon-btn" aria-label="Ver" data-tip="Ver"><Eye aria-hidden /></Link>
                    {o.downloadUrl && (
                      <a href={o.downloadUrl} target="_blank" rel="noreferrer" aria-label="Baixar PDF" data-tip="Baixar PDF" className="icon-btn">
                        <Download aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {aba === "demandas" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <section className="ui-card h-fit p-5 lg:col-span-2">
              <h2 className="section-title flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-gold" aria-hidden /> Gerar demandas
              </h2>
              <p className="mt-0.5 text-xs text-muted">Nada vira atividade até você aprovar.</p>
              <GerarDemandas
                clientId={client.id}
                temTriagem={temBase}
                onboardings={onboardings.map((o) => ({ id: o.id, titulo: `Onboarding de ${dataBR(o.created_at)}` }))}
                atas={atas.map((a) => ({ id: a.id, titulo: a.meeting_date ? `${a.title} (${dataBR(a.meeting_date)})` : a.title }))}
                temRascunhos={pendentes > 0}
                responsaveis={responsaveis}
                meuResponsavel={meuResponsavel}
              />
            </section>
            <section className="ui-card p-5 lg:col-span-3">
              <h2 className="section-title mb-3">
                Rascunhos para revisar {pendentes ? <span className="text-muted tabular-nums">· {pendentes}</span> : null}
              </h2>
              <DemandsSection clientId={client.id} drafts={drafts} responsaveis={responsaveis} meuResponsavel={meuResponsavel} />
            </section>
          </div>
        )}

        {aba === "relatorios" && (
          <ReportsTab
            clientId={client.id}
            relatorios={relatorios.map((r) => ({
              id: r.id,
              reference_month: r.reference_month,
              reference_year: r.reference_year,
              created_at: r.created_at,
              sent_at: r.sent_at,
              downloadUrl: r.downloadUrl,
            }))}
          />
        )}

        {aba === "acesso" && (
          <section className="ui-card p-5">
            <h2 className="section-title">Acesso ao portal do cliente</h2>
            {portalUser ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-status-success-bg px-4 py-3">
                <KeyRound className="h-4 w-4 text-status-success" aria-hidden />
                <p className="flex-1 text-sm text-foreground">
                  <span className="font-medium">{portalUser.full_name}</span> <span className="text-muted">({portalUser.email})</span> já acessa o portal.
                </p>
                <ConfirmSubmitButton
                  action={removeClientPortalUserAction}
                  hiddenFields={{ user_id: portalUser.user_id, client_id: client.id }}
                  confirmMessage={`Remover o acesso de ${portalUser.full_name} ao portal?`}
                  label="Remover acesso"
                  icon="user-x"
                />
              </div>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">Convide o contato principal para acompanhar pelo portal:</p>
                <PortalAccessInvite clientId={client.id} />
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-1.5 rounded-md bg-navy/[0.07] px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-navy-3">
      {children}
    </span>
  );
}
