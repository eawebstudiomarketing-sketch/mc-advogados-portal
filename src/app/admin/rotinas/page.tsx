import Link from "next/link";
import { ehSuperAdmin, getPermissoes, requireRole } from "@/lib/dal";
import { listPessoas } from "@/lib/data/escritorio";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { cumprimento, listarItensRotina, progressoDoDia, relatorioDoDia, rotinaDoDia, type LinhaRelatorio } from "@/lib/data/rotina-diaria";
import { hojeBahia, somaDias } from "@/lib/periodo";
import { Avatar } from "@/components/ui/avatar";
import { MinhaRotina } from "@/components/rotina/minha-rotina";
import { EditorRotina } from "./editor";

// Rotinas: a rotina de hoje de quem está logado e, para o admin máximo, o
// editor da rotina de cada pessoa (horários, dias, observação) e o
// cumprimento de cada um (hoje, 7 e 30 dias, no horário).

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

export default async function RotinasPage({ searchParams }: { searchParams: Promise<{ pessoa?: string; dia?: string }> }) {
  const profile = await requireRole(["admin", "advogado"]);
  const souSuper = ehSuperAdmin(profile);
  const permissoes = (await getPermissoes())!;
  const verEquipe = souSuper || permissoes.ver_equipe;
  const hoje = hojeBahia();
  const sp = await searchParams;
  const diaRelatorio = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") && sp.dia! <= hoje ? sp.dia! : hoje;

  const [pessoas, eu] = await Promise.all([listPessoas(), responsavelDoPerfil(profile.id)]);
  const [minha, itens, progresso, c7, c30, relatorio] = await Promise.all([
    eu ? rotinaDoDia(eu, hoje) : Promise.resolve([]),
    souSuper ? listarItensRotina() : Promise.resolve([]),
    verEquipe ? progressoDoDia(hoje) : Promise.resolve(new Map()),
    verEquipe ? cumprimento(somaDias(hoje, -6), hoje) : Promise.resolve(new Map()),
    verEquipe ? cumprimento(somaDias(hoje, -29), hoje) : Promise.resolve(new Map()),
    verEquipe ? relatorioDoDia(diaRelatorio) : Promise.resolve(new Map<string, LinhaRelatorio[]>()),
  ]);
  const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });
  const comRotina = new Set(itens.map((i) => i.responsavel_id));
  const selecionada = pessoas.find((p) => p.id === sp.pessoa) ?? pessoas.find((p) => p.id === eu) ?? pessoas[0];

  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow mb-2">Operacional · Rotinas</p>
        <h1 className="page-title">Rotinas</h1>
        <p className="mt-1 text-sm text-muted">O que cada pessoa faz todo dia, com horário. Cada item feito vale 1 ponto no ranking e a rotina vai na mensagem das 7h.</p>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${minha.length ? "xl:grid-cols-[1fr_420px]" : ""}`}>
        <div className="min-w-0 space-y-8">
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

          {!verEquipe && !minha.length && <p className="ui-card p-6 text-sm text-muted">Você ainda não tem rotina definida. Quem define é o administrador.</p>}
        </div>

        {minha.length > 0 && (
          <aside className="xl:sticky xl:top-20 xl:self-start">
            <MinhaRotina
              linkTela={false}
              podeMarcar
              itens={minha.map((i) => ({ id: i.id, titulo: i.titulo, feito: i.feito, feitoEm: i.feitoEm, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim, observacao: i.observacao, situacao: i.situacao }))}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
