"use client";

import { useState } from "react";

// Gráficos do Painel do Dono, sem biblioteca. Paleta validada (claro e
// escuro): série 1 azul, série 2 dourado; texto sempre nas cores de texto.
export const COR_1 = "#3a6ea5";
export const COR_2 = "#b8862b";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloData = (d: string) => (d.length === 7 ? `${MESES[Number(d.slice(5, 7)) - 1]}/${d.slice(2, 4)}` : `${d.slice(8, 10)}/${d.slice(5, 7)}`);

function Legenda({ itens }: { itens: { cor: string; rotulo: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {itens.map((i) => (
        <span key={i.rotulo} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: i.cor }} aria-hidden />
          {i.rotulo}
        </span>
      ))}
    </div>
  );
}

/** Linhas criadas × concluídas por dia (ou mês), com cruz e balão ao passar o mouse. */
export function LinhaCriadasConcluidas({
  serie,
  rotulos = ["Criadas", "Concluídas"],
  formatar = (v: number) => v.toLocaleString("pt-BR"),
}: {
  serie: { dia: string; criadas: number; concluidas: number }[];
  /** nomes das duas séries (a mesma linha serve para recebidas × enviadas, faturado × recebido…) */
  rotulos?: [string, string];
  formatar?: (v: number) => string;
}) {
  const [i, setI] = useState<number | null>(null);
  const n = serie.length;
  const max = Math.max(1, ...serie.flatMap((s) => [s.criadas, s.concluidas]));
  const teto = Math.ceil(max / 4) * 4 || 4;
  const x = (k: number) => (n <= 1 ? 50 : (k / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / teto) * 100;
  const pontos = (campo: "criadas" | "concluidas") => serie.map((s, k) => `${x(k)},${y(s[campo])}`).join(" ");
  const marcas = [0, teto / 2, teto];
  const passo = Math.max(1, Math.ceil(n / 7));

  return (
    <div>
      <Legenda itens={[{ cor: COR_1, rotulo: rotulos[0] }, { cor: COR_2, rotulo: rotulos[1] }]} />
      <div className="mt-3 flex gap-2">
        <div className="relative h-48 w-8 shrink-0 text-[10px] text-muted tabular-nums">
          {marcas.map((m) => (
            <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(m)}%` }}>
              {new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(m)}
            </span>
          ))}
        </div>
        <div className="relative h-48 flex-1" onMouseLeave={() => setI(null)}>
          {marcas.map((m) => (
            <div key={m} className="absolute inset-x-0 border-t border-border" style={{ top: `${y(m)}%` }} aria-hidden />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <polyline points={pontos("criadas")} fill="none" stroke={COR_1} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            <polyline points={pontos("concluidas")} fill="none" stroke={COR_2} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {i !== null && (
            <>
              <div className="pointer-events-none absolute inset-y-0 border-l border-border-strong" style={{ left: `${x(i)}%` }} aria-hidden />
              {(["criadas", "concluidas"] as const).map((c) => (
                <span
                  key={c}
                  className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
                  style={{ left: `${x(i)}%`, top: `${y(serie[i][c])}%`, background: c === "criadas" ? COR_1 : COR_2 }}
                  aria-hidden
                />
              ))}
              <div
                className="pointer-events-none absolute top-0 z-10 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
                style={{ left: `${x(i)}%`, transform: `translateX(${x(i) > 60 ? "calc(-100% - 10px)" : "10px"})` }}
              >
                <p className="font-medium text-foreground">{rotuloData(serie[i].dia)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: COR_1 }} /> {rotulos[0]} <b className="ml-auto pl-3 text-foreground tabular-nums">{formatar(serie[i].criadas)}</b>
                </p>
                <p className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: COR_2 }} /> {rotulos[1]} <b className="ml-auto pl-3 text-foreground tabular-nums">{formatar(serie[i].concluidas)}</b>
                </p>
              </div>
            </>
          )}
          <div className="absolute inset-0 flex">
            {serie.map((s, k) => (
              <div key={s.dia} className="h-full flex-1" onMouseEnter={() => setI(k)} onTouchStart={() => setI(k)} />
            ))}
          </div>
        </div>
      </div>
      <div className="relative ml-10 mt-1.5 h-4 text-[10px] text-muted">
        {serie.map((s, k) =>
          k % passo === 0 || k === n - 1 ? (
            <span key={s.dia} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(k)}%` }}>
              {rotuloData(s.dia)}
            </span>
          ) : null
        )}
      </div>
    </div>
  );
}

/** Barras verticais simples (uma série), valor no balão ao passar o mouse. */
export function Barras({ dados, unidade = "", destaque }: { dados: { rotulo: string; valor: number }[]; unidade?: string; destaque?: number }) {
  const [i, setI] = useState<number | null>(null);
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const passo = Math.max(1, Math.ceil(dados.length / 8));
  return (
    <div onMouseLeave={() => setI(null)}>
      <div className="flex h-36 items-end gap-[2px]">
        {dados.map((d, k) => (
          <div key={d.rotulo} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setI(k)} onTouchStart={() => setI(k)}>
            <div
              className="w-full rounded-t-[4px] transition-opacity"
              style={{ height: `${d.valor ? Math.max(3, (d.valor / max) * 100) : 0}%`, background: COR_1, opacity: i === null || i === k ? 1 : 0.45 }}
            />
            {i === k && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-lg">
                <span className="text-muted">{d.rotulo}</span> <b className="text-foreground tabular-nums">{d.valor}{unidade}</b>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[10px] text-muted">
        {dados.map((d, k) => (
          <span key={d.rotulo} className={`flex-1 text-center ${k === destaque ? "font-medium text-foreground" : ""}`}>
            {k % passo === 0 ? d.rotulo : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barra horizontal dividida por situação (aceita / descartada / pendente). */
export function BarraSituacao({ linhas }: { linhas: { rotulo: string; aceita: number; descartada: number; pendente: number }[] }) {
  const partes = [
    { chave: "aceita" as const, rotulo: "Aprovadas", cor: "var(--status-success)" },
    { chave: "descartada" as const, rotulo: "Descartadas", cor: "var(--status-danger)" },
    { chave: "pendente" as const, rotulo: "Pendentes", cor: "var(--status-pending)" },
  ];
  const max = Math.max(1, ...linhas.map((l) => l.aceita + l.descartada + l.pendente));
  if (!linhas.length) return <p className="text-sm text-muted">Nada chegou na Distribuição neste período.</p>;
  return (
    <div className="space-y-3">
      <Legenda itens={partes.map((p) => ({ cor: p.cor, rotulo: p.rotulo }))} />
      {linhas.map((l) => {
        const total = l.aceita + l.descartada + l.pendente;
        return (
          <div key={l.rotulo}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-foreground">{l.rotulo}</span>
              <span className="text-muted tabular-nums">{total}</span>
            </div>
            <div className="flex h-3 gap-[2px]" style={{ width: `${(total / max) * 100}%` }}>
              {partes.map((p) =>
                l[p.chave] ? (
                  <div key={p.chave} title={`${p.rotulo}: ${l[p.chave]}`} className="h-full first:rounded-l-[4px] last:rounded-r-[4px]" style={{ flex: l[p.chave], background: p.cor }} />
                ) : null
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Barras horizontais simples (uma série), com o valor ao lado. */
export function BarrasH({ dados }: { dados: { rotulo: string; valor: number }[] }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <ul className="space-y-2">
      {dados.map((d) => (
        <li key={d.rotulo} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-xs">
          <span className="truncate text-foreground" title={d.rotulo}>
            {d.rotulo}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 rounded-r-[4px]" style={{ width: `${Math.max(2, (d.valor / max) * 85)}%`, background: COR_1 }} />
            <span className="tabular-nums text-muted">{d.valor}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
