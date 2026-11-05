import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { listPessoas } from "@/lib/data/escritorio";
import { listarItensRotina, rotinaDoDia, rotinaOutrosDias } from "@/lib/data/rotina-diaria";
import { Avatar } from "@/components/ui/avatar";
import { MinhaRotina } from "@/components/rotina/minha-rotina";
import { ModalRotina } from "@/components/rotina/modal-rotina";
import { RelatorioDoDia } from "@/components/rotina/relatorio-do-dia";
import { AprovarRelatorio } from "@/components/rotina/aprovar-relatorio";
import { ExcluirRotina } from "@/components/rotina/excluir-rotina";
import { concluidasNoDia } from "@/lib/rotina-relatorio/dia";
import { carregarModelos, demandasVencidas, equipeDe, lerRelatorio, modeloDaPessoa, prazoDoRelatorio, relatoriosDoDia } from "@/lib/rotina-relatorio/dados";
import { RelatorioLeitura } from "@/components/rotina/relatorio-leitura";
import { enviadoComAtraso } from "@/lib/rotina-relatorio/tipos";
import { EditorRotina } from "./editor";
import { EditorModelos } from "./modelos";

// A rotina de uma pessoa num card no meio da tela: o dia dela (tarefas fixas +
// relatório em etapas) e, para o admin máximo, a configuração. Usada pela página
// Rotinas e pelo reloginho do topo (modal=true: abre por cima da tela em que a
// pessoa está e fechar volta para ela).

const ROTAS = "/admin/rotinas";
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });
const dataBr = (dia: string) => dia.split("-").reverse().join("/");

type Pessoas = Awaited<ReturnType<typeof listPessoas>>;
type Item = Awaited<ReturnType<typeof listarItensRotina>>[number];

export async function rotinaDaPessoa({
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
  modal = false,
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
  /** aberto pelo reloginho por cima de outra tela: só o dia de hoje, e fechar volta para aquela tela */
  modal?: boolean;
}) {
  const href = (a: string, extra = "") => `${ROTAS}?pessoa=${alvo.id}&aba=${a}${extra}`;
  // a própria rotina aparece igual para todos (inclusive o admin máximo): só o dia, sem configuração;
  // a configuração da própria rotina só abre quando pedida (vindo de "Nova rotina")
  const propria = alvo.id === eu;
  const mostrarConfig = souSuper && (!propria || aba !== "hoje");
  const abas = [
    ["hoje", "Hoje"],
    ...(mostrarConfig ? ([["config", "Tarefas fixas"], ["perguntas", "Perguntas do relatório"]] as const) : []),
  ] as readonly (readonly [string, string])[];

  const cabecalho = <Avatar nome={alvo.nome} foto={alvo.foto} tamanho={40} />;
  let corpo: React.ReactNode = null;

  if (aba === "hoje") {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") && sp.dia! <= hoje ? sp.dia! : hoje;
    const meu = alvo.id === eu;
    const editavel = meu && dia === hoje;
    const [itensDia, outros, modelo, rel, prazo] = await Promise.all([
      rotinaDoDia(alvo.id, dia, adm),
      editavel ? rotinaOutrosDias(alvo.id, hoje, adm) : Promise.resolve([]),
      modeloDaPessoa(alvo.id),
      lerRelatorio(alvo.id, dia),
      prazoDoRelatorio(alvo.id),
    ]);
    const [equipe, venc] = editavel && modelo ? await Promise.all([equipeDe(alvo.id), demandasVencidas(alvo.id, hoje)]) : [[], []];
    const concluidas = editavel ? await concluidasNoDia(alvo.id, dia) : [];
    const relsEquipe = souSuper && meu ? (await relatoriosDoDia(dia)).filter((r) => r.responsavel_id !== alvo.id) : [];
    const daEquipe = souSuper && meu ? pessoas.filter((x) => x.id !== alvo.id && (atribuidos.has(x.id) || relsEquipe.some((r) => r.responsavel_id === x.id))) : [];
    const aprovadorNome = pessoas.find((x) => x.id === modelo?.aprovador_id)?.nome ?? "Maurício";
    // fluxo em etapas aberto: a própria pessoa, com modelo, ainda sem enviar
    const fluxoAberto = editavel && !!modelo && rel?.status !== "enviado";
    const secaoEquipe =
      souSuper && meu ? (
          <section aria-label="Relatórios da equipe" className="space-y-3">
            <div>
              <h3 className="section-title">Relatórios da equipe</h3>
              <p className="text-sm text-muted">
                {relsEquipe.filter((r) => r.status === "enviado").length} de {daEquipe.length} enviados · {relsEquipe.filter((r) => r.aprovado_em).length} aprovados. Leia cada um, dê a nota e aprove; depois responda a sua rotina abaixo.
              </p>
            </div>
            {daEquipe.length === 0 ? (
              <p className="text-sm text-muted">Ninguém da equipe tem relatório ainda. Monte os modelos em “Modelos” e atribua às pessoas.</p>
            ) : (
              <ul className="space-y-2">
                {daEquipe.map((x) => {
                  const r = relsEquipe.find((y) => y.responsavel_id === x.id);
                  const enviado = r?.status === "enviado";
                  return (
                    <li key={x.id}>
                      <details className="ui-card p-3.5" open={enviado && !r?.aprovado_em}>
                        <summary className="flex cursor-pointer list-none items-center gap-3">
                          <Avatar nome={x.nome} foto={x.foto} tamanho={32} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{x.nome}</span>
                          {enviado && r?.aprovado_em ? (
                            <span className="rounded bg-status-success-bg px-1.5 py-0.5 text-xs font-semibold text-status-success">Aprovado · nota {r.nota}{enviadoComAtraso(r.enviado_em) ? " · enviado com atraso" : ""}</span>
                          ) : enviado ? (
                            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${enviadoComAtraso(r!.enviado_em) ? "bg-status-pending-bg text-status-pending" : "bg-status-info-bg text-status-info"}`}>Para aprovar · enviado às {horaDe(r!.enviado_em!)}{enviadoComAtraso(r!.enviado_em) ? " (com atraso)" : ""}</span>
                          ) : (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-muted">{r ? "Em rascunho" : dia < hoje ? "Não enviou" : "Ainda não enviou"}</span>
                          )}
                        </summary>
                        {enviado && r && (
                          <div className="mt-4 space-y-4 border-t border-border pt-4">
                            <RelatorioLeitura relatorio={r} />
                            <AprovarRelatorio responsavelId={x.id} dia={dia} nota={r.nota} comentario={r.comentario} aprovadoEm={r.aprovado_em} aprovador={aprovadorNome} />
                            <Link href={`${ROTAS}?pessoa=${x.id}&dia=${dia}`} scroll={false} className="ui-link">
                              Abrir a rotina de {x.nome.replace(/^(Dr\.?|Dra\.?)\s+/i, "").split(" ")[0]} (para corrigir o relatório)
                            </Link>
                          </div>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
      ) : null;
    corpo = (
      <div className="space-y-6">
        {!modal && (
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
        )}

        {secaoEquipe && !fluxoAberto && secaoEquipe}

        {editavel ? (
          <>
            {/* a própria pessoa: com relatório a enviar, o resumo do dia é a 1ª etapa; sem relatório (ou já enviado), só a rotina */}
            {(() => {
              const rotinaDoDiaNode = (
                <MinhaRotina
                  linkTela={false}
                  podeMarcar
                  compacto
                  titulo="Minha rotina de hoje"
                  itens={itensDia.map((i) => ({ id: i.id, titulo: i.titulo, feito: i.feito, feitoEm: i.feitoEm, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim, observacao: i.observacao, situacao: i.situacao, checklist: i.checklist, subFeitos: i.subFeitos }))}
                  outrosDias={outros.map((i) => ({ id: i.id, titulo: i.titulo, dias: i.dias, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim, repeticao: i.repeticao, regra_mensal: i.regra_mensal }))}
                />
              );
              const resumoNode = (
                <div className="space-y-4">
                  {rotinaDoDiaNode}
                  <section className="ui-card p-4">
                    <h3 className="section-title mb-1">Demandas de hoje</h3>
                    <p className="text-sm text-muted">
                      {concluidas.length} {concluidas.length === 1 ? "concluída" : "concluídas"} · <span className={venc.length ? "font-semibold text-status-danger" : ""}>{venc.length} vencidas em aberto</span>
                    </p>
                    {concluidas.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-sm text-foreground/80">
                        {concluidas.slice(0, 8).map((c, k) => (
                          <li key={k} className="truncate">
                            ✅ {c.titulo} <span className="text-xs text-muted">· {c.cliente ?? "Sem cliente"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              );
              if (!modelo) return rotinaDoDiaNode;
              const enviado = rel?.status === "enviado";
              return (
                <>
                  {enviado && rotinaDoDiaNode}
                  <RelatorioDoDia
                    key={modelo.id}
                    perguntas={modelo.perguntas.filter((q) => q.ativa).map((q) => ({ id: q.id, secao: q.secao, texto: q.texto, tipo: q.tipo, opcoes: q.opcoes, obrigatoria: q.obrigatoria }))}
                    equipe={equipe}
                    demandas={enviado && rel.snapshot ? rel.snapshot.demandas : venc}
                    resumo={enviado ? undefined : resumoNode}
                    equipeNode={enviado ? undefined : (secaoEquipe ?? undefined)}
                    prazo={prazo.texto}
                    inicial={{ respostas: rel?.respostas ?? {}, justificativas: rel?.justificativas ?? {}, enviadoEm: enviado ? rel.enviado_em : null }}
                  />
                  {enviado && (
                    <p className="text-sm text-muted">
                      {rel.aprovado_em ? `Aprovado por ${aprovadorNome} · nota ${rel.nota}${rel.comentario ? ` · “${rel.comentario}”` : ""}` : `Aguardando a aprovação de ${aprovadorNome}.`}
                    </p>
                  )}
                </>
              );
            })()}
          </>
        ) : (
          <>
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

            {!modelo && rel?.status !== "enviado" ? (
              <p className="text-sm text-muted">{meu ? "Você não tem relatório do dia." : "Esta pessoa não tem relatório do dia."}</p>
            ) : rel?.status === "enviado" ? (
              souSuper && rel.snapshot ? (
                <div className="space-y-5">
                  {/* o admin máximo lê, dá a nota, aprova e (se quiser) corrige */}
                  <AprovarRelatorio responsavelId={alvo.id} dia={dia} nota={rel.nota} comentario={rel.comentario} aprovadoEm={rel.aprovado_em} aprovador={aprovadorNome} />
                  <RelatorioDoDia
                    key={`${alvo.id}-${dia}-${rel.editado_em ?? ""}`}
                    perguntas={rel.snapshot.perguntas.map((q) => ({ ...q }))}
                    equipe={rel.snapshot.equipe}
                    demandas={rel.snapshot.demandas}
                    edicao={{ responsavelId: alvo.id, dia }}
                    inicial={{ respostas: rel.respostas, justificativas: rel.justificativas, enviadoEm: rel.enviado_em }}
                  />
                  {rel.editado_em && <p className="text-xs text-muted">Corrigido pelo administrador em {dataBr(rel.editado_em.slice(0, 10))} às {horaDe(rel.editado_em)}.</p>}
                </div>
              ) : (
                <p className="text-sm font-semibold text-status-success">Relatório enviado às {horaDe(rel.enviado_em!)}.{rel.aprovado_em ? ` Aprovado · nota ${rel.nota}.` : " Aguardando aprovação."}</p>
              )
            ) : (
              <p className="text-sm text-muted">{rel ? "Relatório em rascunho, ainda não enviado." : dia < hoje ? "O relatório não foi enviado." : "O relatório ainda não foi enviado."}</p>
            )}
          </>
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
          .map((i) => ({ id: i.id, titulo: i.titulo, dias: i.dias, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim, observacao: i.observacao, checklist: i.checklist, repeticao: i.repeticao, regra_mensal: i.regra_mensal }))}
        pessoas={pessoas.filter((p) => p.profileId).map((p) => ({ id: p.id, nome: p.nome, temRotina: comItens.has(p.id) }))}
      />
    );
  } else {
    const modelos = await carregarModelos();
    corpo = <EditorModelos modelos={modelos} pessoas={[{ id: alvo.id, nome: alvo.nome, foto: alvo.foto, modeloId: atribuidos.get(alvo.id) ?? null }]} aprovadores={pessoas.filter((p) => p.profileId).map((p) => ({ id: p.id, nome: p.nome }))} />;
  }

  return (
    <ModalRotina titulo={alvo.nome} subtitulo={alvo.id === eu ? "Sua rotina" : "Rotina"} fecharHref={ROTAS} voltar={modal} cabecalho={cabecalho}>
      {souSuper && !propria && (comItens.has(alvo.id) || atribuidos.has(alvo.id)) && (
        <div className="-mt-1 mb-4 flex justify-end">
          <ExcluirRotina responsavelId={alvo.id} nome={alvo.nome} />
        </div>
      )}
      {abas.length > 1 && (
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
      )}
      {corpo}
    </ModalRotina>
  );
}
