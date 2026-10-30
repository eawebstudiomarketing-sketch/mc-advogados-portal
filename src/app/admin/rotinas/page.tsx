import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus } from "lucide-react";
import { ehSuperAdmin, requireRole } from "@/lib/dal";
import { listPessoas } from "@/lib/data/escritorio";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { listarItensRotina, progressoDoDia, rotinaDoDia, rotinaOutrosDias } from "@/lib/data/rotina-diaria";
import { hojeBahia } from "@/lib/periodo";
import { createAdminClient } from "@/lib/supabase/admin";
import { Avatar } from "@/components/ui/avatar";
import { MinhaRotina } from "@/components/rotina/minha-rotina";
import { ModalRotina } from "@/components/rotina/modal-rotina";
import { RelatorioDoDia } from "@/components/rotina/relatorio-do-dia";
import { RelatorioLeitura } from "@/components/rotina/relatorio-leitura";
import { carregarModelos, demandasVencidas, equipeDe, lerRelatorio, modelosAtribuidos, modeloDaPessoa, relatoriosDoDia } from "@/lib/rotina-relatorio/dados";
import { EditorRotina } from "./editor";
import { EditorModelos } from "./modelos";

// Rotinas (30/10/2026): a página mostra só os cards de rotina, um por pessoa.
// Clicar no card abre a rotina da pessoa num card no meio da tela (o dia dela:
// tarefas fixas + relatório; e, para o admin máximo, a configuração). "Nova
// rotina" abre a escolha da pessoa e, dali, a configuração (tarefas fixas e
// modelo de perguntas). Cada pessoa só vê e preenche a própria; o admin vê o
// estado de todos; só o admin máximo lê as respostas e configura.

const ROTAS = "/admin/rotinas";
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });
const dataBr = (dia: string) => dia.split("-").reverse().join("/");

export default async function RotinasPage({ searchParams }: { searchParams: Promise<{ pessoa?: string; aba?: string; dia?: string; nova?: string }> }) {
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
          <Link href={`${ROTAS}?nova=1`} scroll={false} className="ui-btn">
            <Plus className="h-4 w-4" aria-hidden /> Nova rotina
          </Link>
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
              <li key={p.id}>
                <Link href={`${ROTAS}?pessoa=${p.id}`} scroll={false} className="ui-card block p-4 transition-colors hover:bg-hover">
                  <div className="flex items-center gap-3">
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
                        ) : rel?.status === "enviado" ? (
                          <span className="rounded bg-status-success-bg px-1.5 py-0.5 text-xs font-semibold text-status-success">Enviado às {horaDe(rel.enviado_em!)}</span>
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

      {/* ROTINA DE UMA PESSOA */}
      {alvo && aba && (await rotinaDaPessoa({ alvo, aba, sp, eu, hoje, souSuper, adm, pessoas, itensTodos, comItens, atribuidos }))}
    </div>
  );
}

type Pessoas = Awaited<ReturnType<typeof listPessoas>>;
type Item = Awaited<ReturnType<typeof listarItensRotina>>[number];

async function rotinaDaPessoa({
  alvo,
  aba,
  sp,
  eu,
  hoje,
  souSuper,
  adm,
  pessoas,
  itensTodos,
  comItens,
  atribuidos,
}: {
  alvo: Pessoas[number];
  aba: "hoje" | "config" | "perguntas";
  sp: { dia?: string };
  eu: string | null;
  hoje: string;
  souSuper: boolean;
  adm: SupabaseClient;
  pessoas: Pessoas;
  itensTodos: Item[];
  comItens: Set<string>;
  atribuidos: Map<string, string>;
}) {
  const href = (a: string, extra = "") => `${ROTAS}?pessoa=${alvo.id}&aba=${a}${extra}`;
  const abas = [
    ["hoje", "Hoje"],
    ...(souSuper ? ([["config", "Tarefas fixas"], ["perguntas", "Perguntas do relatório"]] as const) : []),
  ] as readonly (readonly [string, string])[];

  const cabecalho = <Avatar nome={alvo.nome} foto={alvo.foto} tamanho={40} />;
  let corpo: React.ReactNode = null;

  if (aba === "hoje") {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") && sp.dia! <= hoje ? sp.dia! : hoje;
    const meu = alvo.id === eu;
    const editavel = meu && dia === hoje;
    const [itensDia, outros, modelo, rel] = await Promise.all([
      rotinaDoDia(alvo.id, dia, adm),
      editavel ? rotinaOutrosDias(alvo.id, hoje, adm) : Promise.resolve([]),
      modeloDaPessoa(alvo.id),
      lerRelatorio(alvo.id, dia),
    ]);
    const [equipe, venc] = editavel && modelo ? await Promise.all([equipeDe(alvo.id), demandasVencidas(alvo.id, hoje)]) : [[], []];
    corpo = (
      <div className="space-y-6">
        <form method="get" className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="pessoa" value={alvo.id} />
          <input type="hidden" name="aba" value="hoje" />
          <label htmlFor="rot-dia" className="text-sm text-muted">
            Dia
          </label>
          <input id="rot-dia" type="date" name="dia" defaultValue={dia} max={hoje} className="ui-input !w-auto !py-1.5 text-sm" />
          <button type="submit" className="ui-btn-secondary px-3 py-1.5">
            Ver
          </button>
          {dia !== hoje && <span className="text-sm text-muted">Mostrando {dataBr(dia)} (só leitura).</span>}
        </form>

        {editavel ? (
          <MinhaRotina
            linkTela={false}
            podeMarcar
            compacto
            titulo="Minha rotina de hoje"
            itens={itensDia.map((i) => ({ id: i.id, titulo: i.titulo, feito: i.feito, feitoEm: i.feitoEm, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim, observacao: i.observacao, situacao: i.situacao }))}
            outrosDias={outros.map((i) => ({ id: i.id, titulo: i.titulo, dias: i.dias, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim }))}
          />
        ) : (
          <section>
            <h3 className="section-title mb-2">Tarefas fixas {dia === hoje ? "de hoje" : `de ${dataBr(dia)}`}</h3>
            {itensDia.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma tarefa fixa neste dia.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {itensDia.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{i.hora_inicio?.slice(0, 5) ?? "—"}</span>
                    <span aria-hidden>{i.feito ? "✅" : dia < hoje ? "❌" : "⬜"}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{i.titulo}</span>
                    <span className="shrink-0 text-xs text-muted">{i.feito && i.feitoEm ? `feito às ${horaDe(i.feitoEm)}` : dia < hoje ? "não fez" : "ainda não"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {!modelo ? (
          <p className="text-sm text-muted">{meu ? "Você não tem relatório do dia." : "Esta pessoa não tem relatório do dia."}</p>
        ) : editavel ? (
          <RelatorioDoDia
            key={modelo.id}
            perguntas={modelo.perguntas.filter((q) => q.ativa).map((q) => ({ id: q.id, secao: q.secao, texto: q.texto, tipo: q.tipo, opcoes: q.opcoes, obrigatoria: q.obrigatoria }))}
            equipe={equipe}
            demandas={rel?.status === "enviado" && rel.snapshot ? rel.snapshot.demandas : venc}
            inicial={{ respostas: rel?.respostas ?? {}, justificativas: rel?.justificativas ?? {}, enviadoEm: rel?.status === "enviado" ? rel.enviado_em : null }}
          />
        ) : (
          <section>
            <h3 className="section-title mb-2">Relatório do dia</h3>
            {rel?.status === "enviado" ? (
              <>
                <p className="mb-3 text-sm font-semibold text-status-success">Enviado às {horaDe(rel.enviado_em!)}</p>
                {souSuper ? <RelatorioLeitura relatorio={rel} /> : <p className="text-sm text-muted">Só o administrador máximo lê as respostas.</p>}
              </>
            ) : (
              <p className="text-sm text-muted">{rel ? "Em rascunho, ainda não enviado." : dia < hoje ? "Não foi enviado." : "Ainda não foi enviado."}</p>
            )}
          </section>
        )}
      </div>
    );
  } else if (aba === "config") {
    corpo = (
      <EditorRotina
        key={alvo.id}
        pessoa={{ id: alvo.id, nome: alvo.nome }}
        itens={itensTodos
          .filter((i) => i.responsavel_id === alvo.id)
          .map((i) => ({ id: i.id, titulo: i.titulo, dias: i.dias, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim, observacao: i.observacao }))}
        pessoas={pessoas.filter((p) => p.profileId).map((p) => ({ id: p.id, nome: p.nome, temRotina: comItens.has(p.id) }))}
      />
    );
  } else {
    const modelos = await carregarModelos();
    corpo = <EditorModelos modelos={modelos} pessoas={[{ id: alvo.id, nome: alvo.nome, foto: alvo.foto, modeloId: atribuidos.get(alvo.id) ?? null }]} />;
  }

  return (
    <ModalRotina titulo={alvo.nome} subtitulo={alvo.id === eu ? "Sua rotina" : "Rotina"} fecharHref={ROTAS} cabecalho={cabecalho}>
      <nav className="-mt-1 mb-5 flex gap-5 border-b border-border" aria-label="Seções da rotina">
        {abas.map(([id, rotulo]) => (
          <Link
            key={id}
            href={href(id)}
            scroll={false}
            aria-current={aba === id ? "page" : undefined}
            className={`-mb-px border-b-2 px-0.5 pb-2.5 text-sm transition-colors ${aba === id ? "border-navy-3 font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {rotulo}
          </Link>
        ))}
      </nav>
      {corpo}
    </ModalRotina>
  );
}
