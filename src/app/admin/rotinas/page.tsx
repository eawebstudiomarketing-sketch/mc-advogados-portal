import Link from "next/link";
import { ehSuperAdmin, requireRole } from "@/lib/dal";
import { listPessoas } from "@/lib/data/escritorio";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { cumprimento, listarItensRotina, progressoDoDia, relatorioDoDia, rotinaDoDia, rotinaOutrosDias, type LinhaRelatorio } from "@/lib/data/rotina-diaria";
import { hojeBahia, somaDias } from "@/lib/periodo";
import { Avatar } from "@/components/ui/avatar";
import { MinhaRotina } from "@/components/rotina/minha-rotina";
import { EditorRotina } from "./editor";
import { EditorModelos } from "./modelos";
import { RelatorioDoDia } from "@/components/rotina/relatorio-do-dia";
import { RelatorioLeitura } from "@/components/rotina/relatorio-leitura";
import { carregarModelos, demandasVencidas, equipeDe, lerRelatorio, modelosAtribuidos, modeloDaPessoa, relatoriosDoDia } from "@/lib/rotina-relatorio/dados";

// Rotinas: a rotina de quem está logado (marca a de hoje, vê a da semana);
// para o admin, o cumprimento e o que cada um fez; para o admin máximo, o
// editor da rotina de cada pessoa (horários, dias, observação).

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

export default async function RotinasPage({ searchParams }: { searchParams: Promise<{ pessoa?: string; dia?: string }> }) {
  const profile = await requireRole(["admin", "advogado"]);
  const souSuper = ehSuperAdmin(profile);
  // cumprimento e "o que cada um fez" são só do admin (advogado vê só a dele)
  const verEquipe = souSuper || profile.role === "admin";
  const hoje = hojeBahia();
  const sp = await searchParams;
  const diaRelatorio = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") && sp.dia! <= hoje ? sp.dia! : hoje;

  const [pessoas, eu] = await Promise.all([listPessoas(), responsavelDoPerfil(profile.id)]);
  const [minha, minhaOutros, itens, progresso, c7, c30, relatorio] = await Promise.all([
    eu ? rotinaDoDia(eu, hoje) : Promise.resolve([]),
    eu ? rotinaOutrosDias(eu, hoje) : Promise.resolve([]),
    souSuper ? listarItensRotina() : Promise.resolve([]),
    verEquipe ? progressoDoDia(hoje) : Promise.resolve(new Map()),
    verEquipe ? cumprimento(somaDias(hoje, -6), hoje) : Promise.resolve(new Map()),
    verEquipe ? cumprimento(somaDias(hoje, -29), hoje) : Promise.resolve(new Map()),
    verEquipe ? relatorioDoDia(diaRelatorio) : Promise.resolve(new Map<string, LinhaRelatorio[]>()),
  ]);
  // Rotinas v2: relatório do dia (o meu, o estado de cada um e, para o admin máximo, os modelos)
  const meuModelo = eu ? await modeloDaPessoa(eu) : null;
  const [meuRelatorio, minhaEquipe, minhasVencidas, relatoriosDia, modelos, atribuidos] = await Promise.all([
    eu && meuModelo ? lerRelatorio(eu, hoje) : Promise.resolve(null),
    eu && meuModelo ? equipeDe(eu) : Promise.resolve([]),
    eu && meuModelo ? demandasVencidas(eu, hoje) : Promise.resolve([]),
    verEquipe ? relatoriosDoDia(diaRelatorio) : Promise.resolve([]),
    souSuper ? carregarModelos() : Promise.resolve([]),
    souSuper ? modelosAtribuidos() : Promise.resolve(new Map<string, string>()),
  ]);
  const relatorioDe = new Map(relatoriosDia.map((r) => [r.responsavel_id, r]));
  const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });
  const temMinha = minha.length > 0 || minhaOutros.length > 0;
  const comRotina = new Set(itens.map((i) => i.responsavel_id));
  const selecionada = pessoas.find((p) => p.id === sp.pessoa) ?? pessoas.find((p) => p.id === eu) ?? pessoas[0];

  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow mb-2">Operacional · Rotinas</p>
        <h1 className="page-title">Rotinas</h1>
        <p className="mt-1 text-sm text-muted">O que cada pessoa faz todo dia, com horário. Cada item feito vale 1 ponto no ranking e a rotina vai na mensagem das 8h.</p>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${temMinha && verEquipe ? "xl:grid-cols-[1fr_420px]" : ""}`}>
        <div className="min-w-0 space-y-8">
          {/* relatório do dia da própria pessoa */}
          {eu && meuModelo && (
            <RelatorioDoDia
              key={meuModelo.id}
              perguntas={meuModelo.perguntas.filter((q) => q.ativa).map((q) => ({ id: q.id, secao: q.secao, texto: q.texto, tipo: q.tipo, opcoes: q.opcoes, obrigatoria: q.obrigatoria }))}
              equipe={minhaEquipe}
              demandas={meuRelatorio?.status === "enviado" && meuRelatorio.snapshot ? meuRelatorio.snapshot.demandas : minhasVencidas}
              inicial={{ respostas: meuRelatorio?.respostas ?? {}, justificativas: meuRelatorio?.justificativas ?? {}, enviadoEm: meuRelatorio?.status === "enviado" ? meuRelatorio.enviado_em : null }}
            />
          )}

          {/* cumprimento da equipe */}
          {verEquipe && (
            <section>
              <h2 className="section-title mb-3">Cumprimento</h2>
              <div className="ui-card overflow-x-auto">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th className="px-4">Pessoa</th>
                      <th className="px-4">Hoje</th>
                      <th className="px-4">7 dias</th>
                      <th className="px-4">30 dias</th>
                      <th className="px-4">No horário (30 d)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pessoas.map((p) => {
                      const h = progresso.get(p.id);
                      const s7 = c7.get(p.id);
                      const s30 = c30.get(p.id);
                      if (!h?.total && !s30?.esperados) return null;
                      const p7 = s7 ? pct(s7.feitos, s7.esperados) : null;
                      const p30 = s30 ? pct(s30.feitos, s30.esperados) : null;
                      const cor = (v: number | null) => (v === null ? "text-muted" : v >= 90 ? "text-status-success" : v >= 60 ? "text-status-pending" : "text-status-danger");
                      return (
                        <tr key={p.id}>
                          <td className="px-4">
                            <Link href={`/admin/rotinas?pessoa=${p.id}`} className="flex items-center gap-2 text-sm text-foreground hover:underline">
                              <Avatar nome={p.nome} foto={p.foto} tamanho={26} /> {p.nome}
                            </Link>
                          </td>
                          <td className="px-4 text-sm tabular-nums">{h?.total ? `${h.feitos}/${h.total}` : "—"}</td>
                          <td className={`px-4 text-sm font-semibold tabular-nums ${cor(p7)}`}>{p7 === null ? "—" : `${p7}%`}</td>
                          <td className={`px-4 text-sm font-semibold tabular-nums ${cor(p30)}`}>{p30 === null ? "—" : `${p30}%`}</td>
                          <td className="px-4 text-sm tabular-nums text-foreground/70">{s30?.feitos ? `${pct(s30.noHorario, s30.feitos)}%` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {![...progresso.values()].some((x) => x.total) && ![...c30.values()].some((x) => x.esperados) && (
                  <p className="px-4 py-6 text-center text-sm text-muted">Ninguém tem rotina ainda.</p>
                )}
              </div>
            </section>
          )}

          {/* relatório do dia: o que cada um fez e não fez */}
          {verEquipe && (
            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h2 className="section-title">O que cada um fez</h2>
                <form method="get" className="flex items-center gap-1.5">
                  {sp.pessoa && <input type="hidden" name="pessoa" value={sp.pessoa} />}
                  <input type="date" name="dia" defaultValue={diaRelatorio} max={hoje} className="ui-input !w-auto !py-1.5 text-sm" aria-label="Dia do relatório" />
                  <button type="submit" className="ui-btn-secondary px-3 py-1.5 text-xs">
                    Ver
                  </button>
                </form>
              </div>
              {relatorio.size === 0 ? (
                <p className="ui-card p-6 text-center text-sm text-muted">Nenhuma rotina para este dia.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {pessoas
                    .filter((p) => relatorio.has(p.id))
                    .map((p) => {
                      const linhas = relatorio.get(p.id)!;
                      const feitos = linhas.filter((l) => l.feitoEm).length;
                      return (
                        <div key={p.id} className="ui-card p-4">
                          <div className="mb-2 flex items-center gap-2">
                            <Avatar nome={p.nome} foto={p.foto} tamanho={28} />
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{p.nome}</p>
                            <span className={`text-sm font-semibold tabular-nums ${feitos === linhas.length ? "text-status-success" : "text-foreground/70"}`}>
                              {feitos}/{linhas.length}
                            </span>
                          </div>
                          {(() => {
                            const rel = relatorioDe.get(p.id);
                            if (!atribuidos.has(p.id) && !rel && !souSuper) return null;
                            const situacao = rel?.status === "enviado" ? `Relatório enviado às ${horaDe(rel.enviado_em!)}` : rel ? "Relatório em rascunho" : diaRelatorio < hoje ? "Relatório não enviado" : "Relatório ainda não enviado";
                            if (!rel && !atribuidos.has(p.id)) return null;
                            return (
                              <div className="mb-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-xs">
                                <p className={rel?.status === "enviado" ? "font-semibold text-status-success" : diaRelatorio < hoje ? "font-semibold text-status-danger" : "text-muted"}>{situacao}</p>
                                {souSuper && rel?.status === "enviado" && (
                                  <details className="mt-1">
                                    <summary className="cursor-pointer text-foreground/80 hover:underline">Ler relatório</summary>
                                    <div className="mt-2">
                                      <RelatorioLeitura relatorio={rel} />
                                    </div>
                                  </details>
                                )}
                              </div>
                            );
                          })()}
                          <ul className="divide-y divide-border">
                            {linhas.map(({ item, feitoEm, noHorario, passou }) => (
                              <li key={item.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                                <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted">{item.hora_inicio?.slice(0, 5) ?? "—"}</span>
                                <span className="shrink-0" aria-hidden>
                                  {feitoEm ? (noHorario ? "✅" : "⏰") : passou ? "❌" : "⬜"}
                                </span>
                                <span className={`min-w-0 flex-1 truncate ${feitoEm ? "text-foreground" : "text-foreground/70"}`}>{item.titulo}</span>
                                <span className={`shrink-0 text-[11px] ${feitoEm ? (noHorario ? "text-status-success" : "text-status-pending") : passou ? "text-status-danger" : "text-muted"}`}>
                                  {feitoEm ? `${noHorario ? "feito" : "atrasado"} ${horaDe(feitoEm)}` : diaRelatorio < hoje ? "não fez" : passou ? "passou da hora" : "ainda não"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>
          )}

          {/* modelos de pergunta do relatório do dia (admin máximo) */}
          {souSuper && (
            <section>
              <h2 className="section-title mb-1">Modelos do relatório do dia</h2>
              <p className="mb-3 text-sm text-muted">As perguntas que cada pessoa responde no fim do dia. Você monta, escolhe quem usa e lê as respostas em “O que cada um fez”.</p>
              <EditorModelos
                modelos={modelos}
                pessoas={pessoas.filter((p) => p.profileId).map((p) => ({ id: p.id, nome: p.nome, foto: p.foto, modeloId: atribuidos.get(p.id) ?? null }))}
              />
            </section>
          )}

          {/* editor (admin máximo) */}
          {souSuper && selecionada && (
            <section>
              <h2 className="section-title mb-3">Montar a rotina</h2>
              <div className="mb-4 flex flex-wrap gap-2">
                {pessoas.map((p) => {
                  const on = p.id === selecionada.id;
                  return (
                    <Link
                      key={p.id}
                      href={`/admin/rotinas?pessoa=${p.id}`}
                      scroll={false}
                      className={`inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors ${
                        on ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/80 hover:border-border-strong"
                      }`}
                    >
                      <Avatar nome={p.nome} foto={p.foto} tamanho={26} />
                      {p.nome.replace(/^(Dr\.?|Dra\.?)\s+/i, "").split(" ")[0]}
                      {comRotina.has(p.id) && <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-gold-2" : "bg-status-success"}`} aria-label="tem rotina" />}
                    </Link>
                  );
                })}
              </div>
              <EditorRotina
                key={selecionada.id}
                pessoa={{ id: selecionada.id, nome: selecionada.nome }}
                itens={itens
                  .filter((i) => i.responsavel_id === selecionada.id)
                  .map((i) => ({ id: i.id, titulo: i.titulo, dias: i.dias, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim, observacao: i.observacao }))}
                pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome, temRotina: comRotina.has(p.id) }))}
              />
            </section>
          )}

          {!verEquipe && !temMinha && <p className="ui-card p-6 text-sm text-muted">Você ainda não tem rotina definida. Quem define é o administrador.</p>}
        </div>

        {temMinha && (
          <aside className={verEquipe ? "xl:sticky xl:top-20 xl:self-start" : "max-w-2xl"}>
            <MinhaRotina
              linkTela={false}
              podeMarcar
              itens={minha.map((i) => ({ id: i.id, titulo: i.titulo, feito: i.feito, feitoEm: i.feitoEm, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim, observacao: i.observacao, situacao: i.situacao }))}
              outrosDias={minhaOutros.map((i) => ({ id: i.id, titulo: i.titulo, dias: i.dias, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim }))}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
