"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { aberta, atrasada, dataBahia, dias, hojeBahia, media, noPrazo, notaPessoa, notaPorTempo, somaDias, type LinhaAtividade } from "@/lib/painel/base";
import { Barras, COR_1, COR_2 } from "./graficos";
import { Anel, BarrasPessoas, Ranking } from "./graficos2";
import { FiltroQuadro, Quadro, usePainel, useFiltro } from "./contexto";

const iniciais = (n: string) =>
  n
    .replace(/^(Dra?\.)\s+/i, "")
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

function Foto({ nome, foto, grande = false }: { nome: string; foto: string | null; grande?: boolean }) {
  const t = grande ? "h-16 w-16 text-lg" : "h-11 w-11 text-sm";
  return foto ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={foto} alt="" className={`${t} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${t} flex shrink-0 items-center justify-center rounded-full bg-navy font-semibold text-white`} aria-hidden>
      {iniciais(nome)}
    </span>
  );
}

function Mini({ rotulo, valor, tom }: { rotulo: string; valor: React.ReactNode; tom?: string }) {
  return (
    <div>
      <p className={`text-lg font-semibold tabular-nums leading-tight ${tom ?? "text-foreground"}`}>{valor}</p>
      <p className="text-[11px] text-muted">{rotulo}</p>
    </div>
  );
}

/** Cartões lado a lado para comparar a equipe. */
export function CartoesResponsaveis({ equipe }: { equipe: string[] }) {
  const { filtro, setFiltro, linhas, periodo } = useFiltro();
  const { responsaveis } = usePainel();
  const pessoas = responsaveis.filter((r) => equipe.includes(r.id));
  const notas = pessoas.map((r) => ({ r, n: notaPessoa(linhas.filter((a) => a.respId === r.id), periodo.ini, periodo.fim) }));
  const mediaEquipe = Math.round(media(notas.flatMap((x) => (x.n.nota === null ? [] : [x.n.nota]))) ?? 0);
  return (
    <Quadro titulo="Equipe" apoio={`${periodo.rotulo} · nota média da equipe ${mediaEquipe}`} filtro={<FiltroQuadro filtro={filtro} setFiltro={setFiltro} campos={{ periodo: true, cliente: true, tipo: true }} />}>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-xs font-medium text-muted">Atividades de cada um</p>
          <BarrasPessoas
            linhas={notas.map(({ r, n }) => ({ nome: r.nome, href: `/admin/painel?aba=responsaveis&pessoa=${r.id}`, valores: [n.concluidas, Math.max(0, n.abertas - n.atrasadas), n.atrasadas] }))}
            partes={[
              { rotulo: "Concluídas no período", cor: COR_1 },
              { rotulo: "Abertas em dia", cor: COR_2 },
              { rotulo: "Atrasadas", cor: "var(--status-danger)" },
            ]}
          />
        </div>
        <div>
          <p className="mb-3 text-xs font-medium text-muted">Nota de cada um (0–100)</p>
          <Ranking dados={notas.filter((x) => x.n.nota !== null).sort((a, b) => b.n.nota! - a.n.nota!).map(({ r, n }) => ({ rotulo: r.nome, valor: n.nota!, href: `/admin/painel?aba=responsaveis&pessoa=${r.id}`, tom: n.nota! >= 75 ? "var(--status-success)" : n.nota! >= 50 ? "var(--status-pending)" : "var(--status-danger)" }))} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {notas
          .sort((a, b) => (b.n.nota ?? -1) - (a.n.nota ?? -1))
          .map(({ r, n }) => (
            <Link key={r.id} href={`/admin/painel?aba=responsaveis&pessoa=${r.id}`} className="rounded-xl border border-border p-4 transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-border-strong">
              <div className="flex items-center gap-3">
                <Foto nome={r.nome} foto={r.foto} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{r.nome}</p>
                  <p className="text-xs text-muted">carga {n.carga}</p>
                </div>
                <span title="Nota 0–100: prazo, atrasos, rapidez e satisfação">
                  <Anel valor={n.nota} />
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
                <Mini rotulo="concluídas" valor={n.concluidas} />
                <Mini rotulo="abertas" valor={n.abertas} />
                <Mini rotulo="atrasadas" valor={n.atrasadas} tom={n.atrasadas ? "text-status-danger" : undefined} />
                <Mini rotulo="no prazo" valor={n.noPrazoPct === null ? "—" : `${n.noPrazoPct}%`} />
                <Mini rotulo="tempo médio" valor={n.tempoMedioDias === null ? "—" : `${n.tempoMedioDias.toLocaleString("pt-BR")} d`} />
                <Mini rotulo="satisfação" valor={n.satisfacao === null ? "—" : n.satisfacao.toLocaleString("pt-BR")} />
              </div>
            </Link>
          ))}
      </div>
    </Quadro>
  );
}

export type EventoLinha = { quando: string; texto: string; href?: string };

/** Ficha de uma pessoa: nota, atividades, clientes, entregas por semana e linha do tempo. */
export function FichaPessoa({ pessoaId, linhaDoTempo, extras }: { pessoaId: string; linhaDoTempo: EventoLinha[]; extras: { mensagens: number; comentarios: number; horas: number } }) {
  const { responsaveis, clientes, atividades } = usePainel();
  const r = responsaveis.find((x) => x.id === pessoaId);
  const { filtro, setFiltro, linhas, periodo } = useFiltro({ resp: pessoaId });
  const hoje = hojeBahia();
  const minhas = useMemo(() => linhas.filter((a) => a.respId === pessoaId), [linhas, pessoaId]);
  const n = notaPessoa(minhas, periodo.ini, periodo.fim);
  const equipeNotas = responsaveis.map((x) => notaPessoa(atividades.filter((a) => a.respId === x.id), periodo.ini, periodo.fim));
  const mediaEquipe = Math.round(media(equipeNotas.flatMap((x) => (x.nota === null ? [] : [x.nota]))) ?? 0);

  const grupos = useMemo(() => {
    const ab = minhas.filter(aberta);
    const fimSemana = somaDias(hoje, 7);
    const ord = (a: LinhaAtividade, b: LinhaAtividade) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999");
    return [
      { id: "atrasadas", rotulo: "Atrasadas", tom: "text-status-danger", itens: ab.filter((a) => atrasada(a, hoje)).sort(ord) },
      { id: "semana", rotulo: "Vencem nos próximos 7 dias", tom: "text-status-pending", itens: ab.filter((a) => a.prazo && a.prazo >= hoje && a.prazo <= fimSemana).sort(ord) },
      { id: "dia", rotulo: "Em dia (prazo depois)", tom: "text-foreground", itens: ab.filter((a) => a.prazo && a.prazo > fimSemana).sort(ord) },
      { id: "sem", rotulo: "Sem prazo", tom: "text-muted", itens: ab.filter((a) => !a.prazo) },
    ];
  }, [minhas, hoje]);

  const clientesDela = useMemo(() => {
    const ha90 = `${somaDias(hoje, -90)}T03:00:00Z`;
    const agora = `${hoje}T15:00:00Z`;
    const m = new Map<string, { abertas: number; notas: number[] }>();
    for (const a of minhas) {
      if (!a.clienteId || !(aberta(a) || a.criada >= ha90)) continue;
      const v = m.get(a.clienteId) ?? { abertas: 0, notas: [] };
      if (aberta(a)) v.abertas++;
      if (a.status === "concluida" && a.concluida) v.notas.push(notaPorTempo(dias(a.pedido, a.concluida), !noPrazo(a)));
      else if (aberta(a) && dias(a.pedido, agora) > 3) v.notas.push(notaPorTempo(dias(a.pedido, agora), atrasada(a, hoje)));
      m.set(a.clienteId, v);
    }
    return [...m.entries()].map(([id, v]) => ({ id, nome: clientes.get(id)?.nome ?? "?", abertas: v.abertas, nota: media(v.notas) })).sort((a, b) => (a.nota ?? 9) - (b.nota ?? 9));
  }, [minhas, clientes, hoje]);

  const semanas = useMemo(() => {
    const out: { rotulo: string; valor: number }[] = [];
    for (let k = 7; k >= 0; k--) {
      const fim = somaDias(hoje, -7 * k + 1);
      const ini = somaDias(fim, -7);
      out.push({ rotulo: ini.slice(8, 10) + "/" + ini.slice(5, 7), valor: minhas.filter((a) => a.status === "concluida" && a.concluida && dataBahia(a.concluida) >= ini && dataBahia(a.concluida) < fim).length });
    }
    return out;
  }, [minhas, hoje]);

  if (!r) return <p className="text-sm text-muted">Pessoa não encontrada.</p>;
  const diferenca = n.nota === null ? null : n.nota - mediaEquipe;

  return (
    <div className="space-y-4">
      <Link href="/admin/painel?aba=responsaveis" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Equipe
      </Link>
      <div className="ui-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Foto nome={r.nome} foto={r.foto} grande />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-foreground">{r.nome}</h2>
            <p className="text-sm text-muted">
              {r.areas.length ? r.areas.join(" · ") : "Sem áreas definidas"} · {periodo.rotulo.toLowerCase()}
            </p>
          </div>
          <div className="text-right">
            <div className="flex justify-end"><Anel valor={n.nota} tamanho={84} /></div>
            <p className="mt-1 text-xs text-muted">
              {diferenca === null ? "sem atividades no período" : diferenca === 0 ? "igual à média" : `${diferenca > 0 ? "+" : ""}${diferenca} vs média da equipe (${mediaEquipe})`}
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4 sm:grid-cols-5 lg:grid-cols-9">
          <Mini rotulo="concluídas" valor={n.concluidas} />
          <Mini rotulo="no prazo" valor={n.noPrazoPct === null ? "—" : `${n.noPrazoPct}%`} />
          <Mini rotulo="abertas" valor={n.abertas} />
          <Mini rotulo="atrasadas" valor={n.atrasadas} tom={n.atrasadas ? "text-status-danger" : undefined} />
          <Mini rotulo="tempo médio" valor={n.tempoMedioDias === null ? "—" : `${n.tempoMedioDias.toLocaleString("pt-BR")} d`} />
          <Mini rotulo="satisfação" valor={n.satisfacao === null ? "—" : n.satisfacao.toLocaleString("pt-BR")} />
          <Mini rotulo="carga" valor={n.carga} />
          <Mini rotulo="msgs no Zap" valor={extras.mensagens} />
          <Mini rotulo="comentários" valor={extras.comentarios} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(0,24rem)]">
        <Quadro titulo="Atividades" apoio={`${n.abertas} abertas agora`} filtro={<FiltroQuadro filtro={filtro} setFiltro={setFiltro} campos={{ periodo: true, cliente: true, tipo: true }} />}>
          <div className="space-y-4">
            {grupos.map((g) => (
              <div key={g.id}>
                <p className={`eyebrow mb-1 ${g.tom}`}>
                  {g.rotulo} · {g.itens.length}
                </p>
                {g.itens.length === 0 ? (
                  <p className="py-1 text-xs text-muted">Nenhuma.</p>
                ) : (
                  <ul>
                    {g.itens.map((a) => (
                      <li key={a.id} className="border-t border-border first:border-t-0">
                        <Link href={`/admin/activities/${a.id}`} className="flex items-center gap-3 rounded-md py-2 hover:bg-[var(--hover)]">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{a.clienteId ? clientes.get(a.clienteId)?.nome ?? "?" : "Sem cliente"}</span>
                            <span className="block truncate text-xs text-muted">{a.titulo}</span>
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">{a.prazo ? `${a.prazo.slice(8, 10)}/${a.prazo.slice(5, 7)}${a.hora ? ` ${a.hora}` : ""}` : "—"}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Quadro>
        <div className="space-y-4">
          <Quadro titulo="Entregas por semana" apoio="Últimas 8 semanas">
            <Barras dados={semanas} destaque={semanas.length - 1} />
          </Quadro>
          <Quadro titulo="Clientes que atende" apoio="Satisfação pelo tempo de atendimento (90 dias)">
            {clientesDela.length === 0 ? (
              <p className="text-sm text-muted">Nenhum cliente com atividade recente.</p>
            ) : (
              <ul>
                {clientesDela.map((c) => (
                  <li key={c.id} className="border-t border-border first:border-t-0">
                    <Link href={`/admin/clients/${c.id}`} className="flex items-center gap-3 rounded-md py-2 hover:bg-[var(--hover)]">
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.nome}</span>
                      <span className="shrink-0 text-xs text-muted">{c.abertas} abertas</span>
                      <span className={`w-8 shrink-0 text-right text-sm font-medium tabular-nums ${c.nota === null ? "text-muted" : c.nota < 3 ? "text-status-danger" : c.nota < 4 ? "text-status-pending" : "text-status-success"}`}>
                        {c.nota === null ? "—" : c.nota.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Quadro>
        </div>
      </div>

      <Quadro titulo="Linha do tempo" apoio={`O que ${/^Dra?./.test(r.nome) ? r.nome.split(" ").slice(0, 2).join(" ") : r.nome.split(" ")[0]} fez no período da página · ${extras.horas.toLocaleString("pt-BR")} h lançadas`}>
        {linhaDoTempo.length === 0 ? (
          <p className="text-sm text-muted">Nada registrado no período.</p>
        ) : (
          <ol className="relative ml-1 border-l border-border">
            {linhaDoTempo.map((e, k) => (
              <li key={k} className="relative py-1.5 pl-4">
                <span className="absolute -left-[4.5px] top-3 h-2 w-2 rounded-full bg-border-strong" aria-hidden />
                <span className="mr-2 text-xs tabular-nums text-muted">{new Date(e.quando).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                {e.href ? (
                  <Link href={e.href} className="text-sm text-foreground hover:underline">
                    {e.texto}
                  </Link>
                ) : (
                  <span className="text-sm text-foreground">{e.texto}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Quadro>
    </div>
  );
}

