import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Crown } from "lucide-react";
import { ehSuperAdmin, exigirPermissao } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { listDesignacoes, listPermissoesSalvas, listStaff } from "@/lib/data/team";
import { listClients } from "@/lib/data/clients";
import { listActivities } from "@/lib/data/activities";
import { listEtiquetas } from "@/lib/data/etiquetas";
import { cumprimento } from "@/lib/data/rotina-diaria";
import { hojeBahia, somaDias } from "@/lib/periodo";
import { resolverPermissoes } from "@/lib/permissoes";
import { chaveFone } from "@/lib/painel/equipe-zap";
import { historicoDaPessoa } from "@/lib/rotina-relatorio/dados";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { RelatorioLeitura } from "@/components/rotina/relatorio-leitura";
import { ActivitiesView } from "@/app/admin/activities/activities-view";
import { ConteudoIndicadores } from "@/app/admin/indicadores/conteudo";
import { MembroCard } from "../membro-card";
import { DesignacoesProvider } from "../designacoes";
import { removeStaffAction } from "../actions";

// Página de uma pessoa da equipe (só o admin máximo): tudo dela num lugar só,
// em abas — indicadores com o resumo da IA, rotina (com o histórico de
// relatórios e notas), demandas, WhatsApp e o que ela pode ver e fazer.

const ABAS = [
  ["indicadores", "Indicadores"],
  ["rotina", "Rotina"],
  ["demandas", "Demandas"],
  ["whatsapp", "WhatsApp"],
  ["acessos", "Acessos e permissões"],
] as const;
type Aba = (typeof ABAS)[number][0];

const dataBr = (dia: string) => dia.split("-").reverse().join("/");
const semana = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const ha30Dias = () => new Date(Date.now() - 30 * 86_400_000).toISOString();

export default async function PessoaDaEquipePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; p?: string }> }) {
  const { profile } = await exigirPermissao("equipe");
  if (!ehSuperAdmin(profile)) redirect("/admin/team");
  const { id } = await params;
  const sp = await searchParams;
  const aba: Aba = ABAS.some(([a]) => a === sp.aba) ? (sp.aba as Aba) : "indicadores";
  const adm = createAdminClient() as unknown as SupabaseClient;

  const [{ data: pessoa }, { data: resp }] = await Promise.all([
    adm.from("profiles").select("id, full_name, email, role, ativo, super_admin").eq("id", id).in("role", ["admin", "advogado"]).maybeSingle(),
    adm.from("responsaveis").select("id, foto_url, telefone").eq("profile_id", id).maybeSingle(),
  ]);
  if (!pessoa) notFound();
  const base = `/admin/team/${id}`;

  let corpo: React.ReactNode = null;

  if (aba === "indicadores") {
    corpo = <ConteudoIndicadores sp={{ p: sp.p }} fixo={id} base={`${base}?aba=indicadores`} />;
  } else if (aba === "rotina") {
    if (!resp) corpo = <p className="ui-card p-6 text-sm text-muted">Esta pessoa ainda não está ligada a um responsável, então não tem rotina.</p>;
    else {
      const hoje = hojeBahia();
      const [hist, c7, c30] = await Promise.all([historicoDaPessoa(resp.id), cumprimento(somaDias(hoje, -6), hoje, adm), cumprimento(somaDias(hoje, -29), hoje, adm)]);
      const s7 = c7.get(resp.id);
      const s30 = c30.get(resp.id);
      const notas = hist.filter((r) => r.nota !== null).map((r) => r.nota!);
      const media = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null;
      corpo = (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Tarefas fixas · 7 dias", s7?.esperados ? `${pct(s7.feitos, s7.esperados)}%` : "—"],
              ["Tarefas fixas · 30 dias", s30?.esperados ? `${pct(s30.feitos, s30.esperados)}%` : "—"],
              ["Relatórios enviados", String(hist.filter((r) => r.status === "enviado").length)],
              ["Nota média das rotinas", media === null ? "—" : `${String(media).replace(".", ",")} de 10`],
            ].map(([r, v]) => (
              <div key={r} className="ui-card p-4">
                <p className="eyebrow">{r}</p>
                <p className="numero-grande mt-1 text-2xl text-foreground">{v}</p>
              </div>
            ))}
          </div>
          <section aria-label="Histórico de relatórios" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Histórico de relatórios</h2>
              <Link href={`/admin/rotinas?pessoa=${resp.id}`} className="ui-link">
                Abrir a rotina de hoje
              </Link>
            </div>
            {hist.length === 0 ? (
              <p className="ui-card p-6 text-sm text-muted">Nenhum relatório ainda.</p>
            ) : (
              <ul className="space-y-2">
                {hist.map((r) => (
                  <li key={r.dia}>
                    <details className="ui-card p-3.5">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
                        <span className="w-28 text-sm font-medium text-foreground tabular-nums">
                          {dataBr(r.dia)} <span className="text-xs font-normal text-muted">{semana(r.dia)}</span>
                        </span>
                        {r.status === "enviado" ? (
                          <span className="rounded bg-status-success-bg px-1.5 py-0.5 text-xs font-semibold text-status-success">Enviado às {quando(r.enviado_em!).slice(-5)}</span>
                        ) : (
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-muted">Rascunho (não enviado)</span>
                        )}
                        {r.aprovado_em ? (
                          <span className="rounded bg-status-info-bg px-1.5 py-0.5 text-xs font-semibold text-status-info">Nota {r.nota}</span>
                        ) : r.status === "enviado" ? (
                          <span className="text-xs text-muted">aguarda aprovação</span>
                        ) : null}
                        {r.comentario && <span className="min-w-0 flex-1 truncate text-xs text-muted">“{r.comentario}”</span>}
                      </summary>
                      <div className="mt-4 border-t border-border pt-4">
                        {r.status === "enviado" ? <RelatorioLeitura relatorio={r} /> : <p className="text-sm text-muted">Este relatório não foi enviado.</p>}
                        {r.editado_em && <p className="mt-3 text-xs text-muted">Corrigido pelo administrador em {quando(r.editado_em)}.</p>}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      );
    }
  } else if (aba === "demandas") {
    if (!resp) corpo = <p className="ui-card p-6 text-sm text-muted">Esta pessoa ainda não está ligada a um responsável.</p>;
    else {
      const [todas, etiquetas] = await Promise.all([listActivities(), listEtiquetas()]);
      const dela = todas.filter((a) => a.responsavel_id === resp.id || (a.envolvidos ?? []).includes(resp.id));
      corpo = (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {dela.length} {dela.length === 1 ? "demanda ativa" : "demandas ativas"} em que é responsável ou está envolvida.
          </p>
          <ActivitiesView activities={dela} etiquetas={etiquetas} podeExcluir />
        </div>
      );
    }
  } else if (aba === "whatsapp") {
    const chave = chaveFone(resp?.telefone ?? null);
    const desde = ha30Dias();
    const [doCelular, peloPortal, total30] = await Promise.all([
      chave
        ? adm.from("wa_messages").select("id, chat_jid, texto, tipo, wa_timestamp").like("sender_jid", `%${chave}%`).order("wa_timestamp", { ascending: false }).limit(40)
        : Promise.resolve({ data: [] as { id: string; chat_jid: string; texto: string | null; tipo: string; wa_timestamp: string }[] }),
      adm.from("wa_jobs").select("id, tipo, payload, chat_jid, status, created_at").eq("criado_por", id).in("tipo", ["enviar_mensagem", "enviar_arquivo"]).order("created_at", { ascending: false }).limit(40),
      chave ? adm.from("wa_messages").select("id", { count: "exact", head: true }).like("sender_jid", `%${chave}%`).gte("wa_timestamp", desde) : Promise.resolve({ count: 0 }),
    ]);
    const msgs = (doCelular.data ?? []) as { id: string; chat_jid: string; texto: string | null; tipo: string; wa_timestamp: string }[];
    const envios = (peloPortal.data ?? []) as { id: string; tipo: string; payload: { para?: string; texto?: string; nome?: string } | null; chat_jid: string | null; status: string; created_at: string }[];
    const jids = [...new Set([...msgs.map((m) => m.chat_jid), ...envios.map((e) => e.chat_jid ?? "").filter(Boolean)])];
    const { data: chats } = jids.length ? await adm.from("wa_chats").select("chat_jid, nome").in("chat_jid", jids) : { data: [] };
    const nomeChat = new Map(((chats ?? []) as { chat_jid: string; nome: string | null }[]).map((c) => [c.chat_jid, c.nome]));
    corpo = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="ui-card p-4">
            <p className="eyebrow">Mensagens nos grupos · 30 dias</p>
            <p className="numero-grande mt-1 text-2xl text-foreground">{chave ? (total30.count ?? 0) : "—"}</p>
          </div>
          <div className="ui-card p-4">
            <p className="eyebrow">Enviadas pelo portal</p>
            <p className="numero-grande mt-1 text-2xl text-foreground">{envios.length}</p>
          </div>
        </div>
        {!chave && <p className="text-sm text-muted">Sem WhatsApp cadastrado para esta pessoa em Equipe › Pessoas, áreas e WhatsApp.</p>}
        <section className="space-y-2">
          <h2 className="section-title">Últimas mensagens dela nos grupos dos clientes</h2>
          {msgs.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma mensagem encontrada.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {msgs.map((m) => (
                <li key={m.id} className="px-3 py-2 text-sm">
                  <span className="text-xs text-muted">
                    {quando(m.wa_timestamp)} · {nomeChat.get(m.chat_jid) ?? m.chat_jid.split("@")[0]}
                  </span>
                  <p className="truncate text-foreground">{m.texto || `[${m.tipo}]`}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-2">
          <h2 className="section-title">Enviadas por ela pelo portal</h2>
          {envios.length === 0 ? (
            <p className="text-sm text-muted">Nenhum envio pelo portal.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {envios.map((e) => (
                <li key={e.id} className="px-3 py-2 text-sm">
                  <span className="text-xs text-muted">
                    {quando(e.created_at)} · {(e.chat_jid && nomeChat.get(e.chat_jid)) || e.payload?.para || "—"} · {e.status}
                  </span>
                  <p className="truncate text-foreground">{e.payload?.texto || e.payload?.nome || `[${e.tipo}]`}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  } else {
    if (pessoa.super_admin) {
      corpo = (
        <p className="ui-card flex items-center gap-2 p-5 text-sm text-foreground">
          <Crown className="h-4 w-4 text-gold-ink" aria-hidden /> Admin máximo: vê tudo e decide o que cada pessoa vê.
        </p>
      );
    } else {
      const [staff, clientes, designacoes, salvas] = await Promise.all([listStaff(), listClients(), listDesignacoes(), listPermissoesSalvas()]);
      const t = staff.find((x) => x.id === id);
      corpo = !t ? (
        <p className="ui-card p-6 text-sm text-muted">Pessoa não encontrada na equipe.</p>
      ) : (
        <DesignacoesProvider inicial={{ [t.id]: designacoes.get(t.id) ?? [] }} nomes={{ [t.id]: t.full_name }}>
          <MembroCard
            papel={t.role === "admin" ? "admin" : "advogado"}
            podeEditar
            membro={{ id: t.id, nome: t.full_name, email: t.email, ativo: t.ativo }}
            clientes={clientes.map((c) => ({ id: c.id, name: c.name, tipo_pessoa: c.tipo_pessoa }))}
            designados={designacoes.get(t.id) ?? []}
            permissoes={resolverPermissoes(t.role === "admin" ? "admin" : "advogado", salvas.get(t.id))}
            acoes={
              <ConfirmSubmitButton
                action={removeStaffAction}
                hiddenFields={{ profile_id: t.id }}
                confirmMessage={`Remover de vez o acesso de ${t.full_name}? O login é apagado (prefira desativar).`}
                label="Remover de vez"
                icon="user-x"
              />
            }
          />
        </DesignacoesProvider>
      );
    }
  }

  return (
    <div>
      <Link href="/admin/team" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Equipe
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar nome={pessoa.full_name} foto={resp?.foto_url ?? null} tamanho={56} />
        <div className="min-w-0">
          <h1 className="page-title">{pessoa.full_name}</h1>
          <p className="text-sm text-muted">
            {pessoa.super_admin ? "Admin máximo" : pessoa.role === "admin" ? "Administrador" : "Advogado(a)"} · {pessoa.email}
            {!pessoa.ativo ? " · acesso desativado" : ""}
          </p>
        </div>
      </div>
      <nav aria-label="Seções da pessoa" className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {ABAS.map(([a, rotulo]) => (
          <Link
            key={a}
            href={a === "indicadores" ? base : `${base}?aba=${a}`}
            aria-current={aba === a ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${aba === a ? "border-navy-3 font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {rotulo}
          </Link>
        ))}
      </nav>
      {corpo}
    </div>
  );
}
