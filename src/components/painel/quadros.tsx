"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DIA, TIPOS, aberta, atrasada, dataBahia, dentro, dias, hojeBahia, pesoAtividade, type LinhaAtividade } from "@/lib/painel/base";
import { COR_1, COR_2, LinhaCriadasConcluidas } from "./graficos";
import { FiltroQuadro, Quadro, usePainel, useFiltro } from "./contexto";
import { Avatar, PorResponsavel } from "./pessoas";


/** Criadas × concluídas por dia (ou mês, em períodos longos). */
export function QuadroCriadasConcluidas() {
  const { filtro, setFiltro, linhas, periodo } = useFiltro();
  const serie = useMemo(() => {
    const longo = dias(periodo.ini, periodo.fim) > 62;
    const chave = (iso: string) => (longo ? dataBahia(iso).slice(0, 7) : dataBahia(iso));
    const mapa = new Map<string, { criadas: number; concluidas: number }>();
    for (let t = Date.parse(periodo.ini); t < Date.parse(periodo.fim); t += DIA) mapa.set(chave(new Date(t).toISOString()), { criadas: 0, concluidas: 0 });
    for (const a of linhas) {
      if (dentro(a.criada, periodo.ini, periodo.fim)) {
        const v = mapa.get(chave(a.criada));
        if (v) v.criadas++;
      }
      if (a.status === "concluida" && dentro(a.concluida, periodo.ini, periodo.fim)) {
        const v = mapa.get(chave(a.concluida!));
        if (v) v.concluidas++;
      }
    }
    return [...mapa.entries()].map(([dia, v]) => ({ dia, ...v }));
  }, [linhas, periodo]);
  const tot = serie.reduce((s, x) => ({ c: s.c + x.criadas, k: s.k + x.concluidas }), { c: 0, k: 0 });
  return (
    <Quadro titulo="Criadas × concluídas" apoio={`${periodo.rotulo} · ${tot.c} criadas, ${tot.k} concluídas`} filtro={<FiltroQuadro filtro={filtro} setFiltro={setFiltro} />}>
      <LinhaCriadasConcluidas serie={serie} />
    </Quadro>
  );
}

/** Abertas × concluídas por tipo (barras horizontais lado a lado). */
export function QuadroPorTipo() {
  const { filtro, setFiltro, linhas, periodo } = useFiltro();
  const dados = useMemo(
    () =>
      Object.entries(TIPOS)
        .map(([t, rotulo]) => ({
          rotulo,
          abertas: linhas.filter((a) => a.tipo === t && aberta(a)).length,
          concluidas: linhas.filter((a) => a.tipo === t && a.status === "concluida" && dentro(a.concluida, periodo.ini, periodo.fim)).length,
        }))
        .filter((d) => d.abertas + d.concluidas > 0)
        .sort((a, b) => b.abertas + b.concluidas - (a.abertas + a.concluidas)),
    [linhas, periodo]
  );
  const max = Math.max(1, ...dados.flatMap((d) => [d.abertas, d.concluidas]));
  return (
    <Quadro titulo="Por tipo" apoio={`Abertas agora × concluídas (${periodo.rotulo.toLowerCase()})`} filtro={<FiltroQuadro filtro={filtro} setFiltro={setFiltro} campos={{ periodo: true, resp: true, cliente: true }} />}>
      <div className="mb-3 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COR_1 }} /> Abertas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COR_2 }} /> Concluídas
        </span>
      </div>
      {dados.length === 0 ? (
        <p className="text-sm text-muted">Nada com esse filtro.</p>
      ) : (
        <ul className="space-y-3">
          {dados.map((d) => (
            <li key={d.rotulo}>
              <p className="mb-1 text-xs text-foreground">{d.rotulo}</p>
              {(["abertas", "concluidas"] as const).map((k) => (
                <div key={k} className="mb-[2px] flex items-center gap-2" title={`${k === "abertas" ? "Abertas" : "Concluídas"}: ${d[k]}`}>
                  <div className="h-2.5 rounded-r-[4px]" style={{ width: `${Math.max(d[k] ? 2 : 0, (d[k] / max) * 85)}%`, background: k === "abertas" ? COR_1 : COR_2 }} />
                  <span className="text-[11px] tabular-nums text-muted">{d[k]}</span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Quadro>
  );
}

/** Abertas há mais tempo (sem período: é o que está aberto agora). */
export function QuadroAbertasAntigas() {
  const { filtro, setFiltro, linhas } = useFiltro();
  const hoje = hojeBahia();
  const abertas = useMemo(() => linhas.filter(aberta).sort((a, b) => a.pedido.localeCompare(b.pedido)), [linhas]);
  const idade = (a: LinhaAtividade) => Math.floor(dias(a.pedido, `${hoje}T15:00:00Z`));
  return (
    <Quadro titulo="Quem está com coisa parada" apoio={`${abertas.length} abertas agora · mais antigas primeiro`} filtro={<FiltroQuadro filtro={filtro} setFiltro={setFiltro} campos={{ resp: true, cliente: true, tipo: true }} />}>
      <PorResponsavel
        itens={abertas}
        vazio="Nenhuma atividade aberta com esse filtro."
        rotuloContagem={(n) => `${n} aberta${n > 1 ? "s" : ""}`}
        direita={(a) => (atrasada(a, hoje) ? { texto: `atrasada · ${idade(a)} d`, tom: "text-status-danger" } : { texto: a.prazo ? `vence ${a.prazo.slice(8, 10)}/${a.prazo.slice(5, 7)}` : `há ${idade(a)} d` })}
      />
    </Quadro>
  );
}

/** Carga estimada de cada pessoa (tipo + prazo + atraso). */
export function QuadroCarga({ equipe }: { equipe: string[] }) {
  const { filtro, setFiltro, linhas } = useFiltro();
  const { responsaveis } = usePainel();
  const hoje = hojeBahia();
  const dados = responsaveis
    .filter((r) => equipe.includes(r.id))
    .map((r) => {
      const minhas = linhas.filter((a) => a.respId === r.id && aberta(a));
      return { id: r.id, nome: r.nome, foto: r.foto, carga: Math.round(minhas.reduce((s, a) => s + pesoAtividade(a, hoje), 0) * 10) / 10, abertas: minhas.length, atrasadas: minhas.filter((a) => atrasada(a, hoje)).length };
    })
    .sort((a, b) => b.carga - a.carga);
  const max = Math.max(1, ...dados.map((d) => d.carga));
  const mediaCarga = dados.length ? dados.reduce((s, d) => s + d.carga, 0) / dados.length : 0;
  return (
    <Quadro titulo="Carga de trabalho agora" apoio="Estimada pelo tipo, prazo e atraso de cada atividade aberta" filtro={<FiltroQuadro filtro={filtro} setFiltro={setFiltro} campos={{ cliente: true, tipo: true }} />}>
      <ul className="space-y-3">
        {dados.map((d) => {
          const alta = d.carga > mediaCarga * 1.3 && d.abertas >= 4;
          return (
            <li key={d.id}>
              <Link href={`/admin/painel?aba=responsaveis&pessoa=${d.id}`} className="group block">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="flex items-center gap-2 text-foreground group-hover:underline">
                    <Avatar nome={d.nome} foto={d.foto} tamanho={22} />
                    {d.nome}
                  </span>
                  <span className="tabular-nums text-muted">
                    {d.abertas} abertas{d.atrasadas ? <span className="text-status-danger"> · {d.atrasadas} atrasadas</span> : null} · carga <b className={alta ? "text-status-danger" : "text-foreground"}>{d.carga}</b>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${(d.carga / max) * 100}%`, background: COR_1 }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted">Peso: processo 3 · contrato/pesquisa 2 · consultoria/reunião 1 · audiência +2 · ×1,5 vencendo em 3 dias · ×1,3 atrasada.</p>
    </Quadro>
  );
}
