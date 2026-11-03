import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FileText, Plus } from "lucide-react";
import { ehSuperAdmin, requireRole } from "@/lib/dal";
import { listPessoas } from "@/lib/data/escritorio";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { listarItensRotina, progressoDoDia } from "@/lib/data/rotina-diaria";
import { hojeBahia } from "@/lib/periodo";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar } from "@/components/ui/avatar";
import { ModalRotina } from "@/components/rotina/modal-rotina";
import { MenuRotina } from "@/components/rotina/menu-rotina";
import { carregarModelos, demandasVencidas, modelosAtribuidos, relatoriosDoDia } from "@/lib/rotina-relatorio/dados";
import { EditorModelos } from "./modelos";
import { rotinaDaPessoa } from "./rotina-da-pessoa";

// Rotinas (30/10/2026): a página mostra só os cards de rotina, um por pessoa.
// Clicar no card abre a rotina da pessoa num card no meio da tela (o dia dela:
// tarefas fixas + relatório; e, para o admin máximo, a configuração). "Nova
// rotina" abre a escolha da pessoa e, dali, a configuração (tarefas fixas e
// modelo de perguntas). Cada pessoa só vê e preenche a própria; o admin vê o
// estado de todos; só o admin máximo lê as respostas e configura.

const ROTAS = "/admin/rotinas";
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });

export default async function RotinasPage({ searchParams }: { searchParams: Promise<{ pessoa?: string; aba?: string; dia?: string; nova?: string; modelos?: string }> }) {
  const profile = await requireRole(["admin", "advogado"]);
  const souSuper = ehSuperAdmin(profile);
  const verEquipe = souSuper || profile.role === "admin";
  const hoje = hojeBahia();
  const sp = await searchParams;
  const adm = createAdminClient() as unknown as SupabaseClient;

  const [pessoas, eu] = await Promise.all([listPessoas(), responsavelDoPerfil(profile.id)]);
  const [itensTodos, atribuidos, progresso, relsHoje] = await Promise.all([listarItensRotina(undefined, adm), modelosAtribuidos(), progressoDoDia(hoje, adm), relatoriosDoDia(hoje)]);
  const comItens = new Set(itensTodos.map((i) => i.responsavel_id));
  const relDe = new Map(relsHoje.map((r) => [r.responsavel_id, r]));

  // quem tem card: quem tem tarefa fixa ou modelo de relatório (cada pessoa só vê o próprio, a não ser o admin)
  const visiveis = pessoas.filter((p) => p.profileId && (comItens.has(p.id) || atribuidos.has(p.id)) && (verEquipe || p.id === eu));
  const vencidas = new Map(await Promise.all(visiveis.map(async (p) => [p.id, (await demandasVencidas(p.id, hoje)).length] as const)));

  const alvo = sp.pessoa ? pessoas.find((p) => p.id === sp.pessoa && (verEquipe || p.id === eu)) : undefined;
  const aba = alvo ? (souSuper && (sp.aba === "config" || sp.aba === "perguntas") ? sp.aba : "hoje") : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Rotinas</h1>
          <p className="mt-1 text-sm text-muted">Uma rotina por pessoa: tarefas fixas do dia e o relatório de fim de expediente.</p>
        </div>
        {souSuper && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`${ROTAS}?modelos=1`} scroll={false} className="ui-btn-secondary">
              <FileText className="h-4 w-4" aria-hidden /> Modelos
            </Link>
            <Link href={`${ROTAS}?nova=1`} scroll={false} className="ui-btn">
              <Plus className="h-4 w-4" aria-hidden /> Nova rotina
            </Link>
          </div>
        )}
      </div>

      {visiveis.length === 0 ? (
        <p className="ui-card p-6 text-sm text-muted">{verEquipe ? "Ainda não há nenhuma rotina. Use “Nova rotina” para criar a primeira." : "Você ainda não tem rotina definida. Quem define é o administrador."}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((p) => {
            const prog = progresso.get(p.id);
            const rel = relDe.get(p.id);
            const venc = vencidas.get(p.id) ?? 0;
            const temModelo = atribuidos.has(p.id);
            return (
              <li key={p.id} className="relative">
                {souSuper && (
                  <div className="absolute top-3 right-3 z-10">
                    <MenuRotina responsavelId={p.id} nome={p.nome} />
                  </div>
                )}
                <Link href={`${ROTAS}?pessoa=${p.id}`} scroll={false} className="ui-card block p-4 transition-colors hover:bg-hover">
                  <div className={`flex items-center gap-3 ${souSuper ? "pr-9" : ""}`}>
                    <Avatar nome={p.nome} foto={p.foto} tamanho={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{p.nome}</p>
                      <p className="text-xs text-muted">{p.id === eu ? "Sua rotina" : "Rotina"}</p>
                    </div>
                  </div>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted">Tarefas fixas de hoje</dt>
                      <dd className={`font-semibold tabular-nums ${prog && prog.total > 0 && prog.feitos === prog.total ? "text-status-success" : "text-foreground"}`}>{prog?.total ? `${prog.feitos}/${prog.total}` : "—"}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted">Relatório do dia</dt>
                      <dd className="text-right">
                        {!temModelo ? (
                          <span className="text-muted">—</span>
                        ) : rel?.status === "enviado" && rel.aprovado_em ? (
                          <span className="rounded bg-status-success-bg px-1.5 py-0.5 text-xs font-semibold text-status-success">Aprovado · nota {rel.nota}</span>
                        ) : rel?.status === "enviado" ? (
                          <span className="rounded bg-status-info-bg px-1.5 py-0.5 text-xs font-semibold text-status-info">Enviado às {horaDe(rel.enviado_em!)} · aguarda aprovação</span>
                        ) : rel ? (
                          <span className="rounded bg-status-pending-bg px-1.5 py-0.5 text-xs font-semibold text-status-pending">Em rascunho</span>
                        ) : (
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-muted">Ainda não enviou</span>
                        )}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted">Demandas vencidas</dt>
                      <dd className={`font-semibold tabular-nums ${venc > 0 ? "text-status-danger" : "text-foreground"}`}>{venc}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* NOVA ROTINA: escolhe a pessoa; a configuração abre na sequência */}
      {souSuper && sp.nova === "1" && !alvo && (
        <ModalRotina titulo="Nova rotina" subtitulo="Escolha a pessoa. Depois você monta as tarefas fixas e as perguntas do relatório." fecharHref={ROTAS}>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {pessoas
              .filter((p) => p.profileId)
              .map((p) => (
                <li key={p.id}>
                  <Link href={`${ROTAS}?pessoa=${p.id}&aba=config`} scroll={false} className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-hover">
                    <Avatar nome={p.nome} foto={p.foto} tamanho={32} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p.nome}</span>
                    {(comItens.has(p.id) || atribuidos.has(p.id)) && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-muted">já tem rotina</span>}
                  </Link>
                </li>
              ))}
          </ul>
        </ModalRotina>
      )}

      {/* MODELOS DE RELATÓRIO: monta as perguntas, escolhe o aprovador e quem usa cada modelo */}
      {souSuper && sp.modelos === "1" && !alvo && (
        <ModalRotina titulo="Modelos de relatório" subtitulo="Monte as perguntas (da pessoa e da equipe), escolha quem aprova e quem usa cada modelo." fecharHref={ROTAS}>
          <EditorModelos
            modelos={await carregarModelos()}
            pessoas={pessoas.filter((p) => p.profileId).map((p) => ({ id: p.id, nome: p.nome, foto: p.foto, modeloId: atribuidos.get(p.id) ?? null }))}
            aprovadores={pessoas.filter((p) => p.profileId).map((p) => ({ id: p.id, nome: p.nome }))}
          />
        </ModalRotina>
      )}

      {/* ROTINA DE UMA PESSOA */}
      {alvo && aba && (await rotinaDaPessoa({ alvo, aba, sp, eu, hoje, souSuper, adm, pessoas, itensTodos, comItens, atribuidos }))}
    </div>
  );
}
