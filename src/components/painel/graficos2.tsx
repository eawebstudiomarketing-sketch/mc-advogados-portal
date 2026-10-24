"use client";

import Link from "next/link";
import { useState } from "react";
import { COR_1 } from "./graficos";

// Medidores, anéis, rosca e minigráficos do Painel do Dono (24/10/2026).
// Cor por situação (verde/âmbar/vermelho) só onde o número É uma situação
// (saúde, nota); séries comuns usam o azul validado.

const corNota = (v: number) => (v >= 75 ? "var(--status-success)" : v >= 50 ? "var(--status-pending)" : "var(--status-danger)");

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

/** Medidor semicircular 0–100 (saúde do escritório). */
export function Medidor({ valor, rotulo }: { valor: number; rotulo?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(valor)));
  const comp = Math.PI * 80;
  return (
    <div className="relative mx-auto w-full max-w-[16rem]">
      <svg viewBox="0 0 200 116" className="w-full" role="img" aria-label={`${rotulo ?? "Valor"}: ${v} de 100`}>
        <path d="M20 104 A80 80 0 0 1 180 104" fill="none" stroke="var(--surface-2)" strokeWidth={16} strokeLinecap="round" />
        <path d="M20 104 A80 80 0 0 1 180 104" fill="none" stroke={corNota(v)} strokeWidth={16} strokeLinecap="round" strokeDasharray={`${(v / 100) * comp} ${comp}`} style={{ transition: "stroke-dasharray 700ms ease-out" }} />
        <text x="20" y="116" textAnchor="middle" fontSize="9" fill="var(--muted)">
          0
        </text>
        <text x="180" y="116" textAnchor="middle" fontSize="9" fill="var(--muted)">
          100
        </text>
      </svg>
      <div className="absolute inset-x-0 bottom-2 text-center">
        <p className="numero-grande text-5xl leading-none" style={{ color: corNota(v) }}>
          {v}
        </p>
        {rotulo && <p className="mt-1 text-[11px] text-muted">{rotulo}</p>}
      </div>
    </div>
  );
}

/** Anel pequeno com o valor no meio (nota 0–100, %, satisfação /5…). */
export function Anel({ valor, max = 100, texto, tamanho = 56, cor }: { valor: number | null; max?: number; texto?: string; tamanho?: number; cor?: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const p = valor === null ? 0 : Math.max(0, Math.min(1, valor / max));
  const tom = cor ?? (valor === null ? "var(--border-strong)" : corNota(p * 100));
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 56 56" role="img" aria-label={valor === null ? "sem dados" : `${texto ?? valor}`} className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--surface-2)" strokeWidth={6} />
      <circle cx="28" cy="28" r={r} fill="none" stroke={tom} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${p * c} ${c}`} transform="rotate(-90 28 28)" style={{ transition: "stroke-dasharray 600ms ease-out" }} />
      <text x="28" y="32" textAnchor="middle" fontSize="13" fontWeight={600} fill="var(--foreground)">
        {valor === null ? "—" : texto ?? valor}
      </text>
    </svg>
  );
}

/** Rosca com legenda e balão ao passar o mouse. */
export function Rosca({ partes, centro, rotuloCentro }: { partes: { rotulo: string; valor: number; cor: string }[]; centro?: string; rotuloCentro?: string }) {
  const [i, setI] = useState<number | null>(null);
  const total = partes.reduce((s, p) => s + p.valor, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  const inicios = partes.reduce<number[]>((acc, p, k) => [...acc, (acc[k] ?? 0) + (total ? (p.valor / total) * c : 0)], [0]);
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative h-36 w-36 shrink-0" onMouseLeave={() => setI(null)}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={partes.map((p) => `${p.rotulo}: ${p.valor}`).join(", ")}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth={14} />
          {total > 0 &&
            partes.map((p, k) =>
              p.valor ? (
                <circle
                  key={p.rotulo}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={p.cor}
                  strokeWidth={i === k ? 17 : 14}
                  strokeDasharray={`${Math.max(0.5, (p.valor / total) * c - 1.2)} ${c}`}
                  strokeDashoffset={-inicios[k]}
                  onMouseEnter={() => setI(k)}
                  className="transition-[stroke-width]"
                />
              ) : null
            )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="numero-grande text-2xl leading-none text-foreground">{i !== null ? partes[i].valor : centro ?? total}</p>
          <p className="mt-0.5 max-w-[5.5rem] text-[10px] leading-tight text-muted">{i !== null ? `${partes[i].rotulo} · ${total ? Math.round((partes[i].valor / total) * 100) : 0}%` : rotuloCentro ?? "total"}</p>
        </div>
      </div>
      <ul className="min-w-0 space-y-1.5 text-xs">
        {partes.map((p, k) => (
          <li key={p.rotulo} className="flex items-center gap-2" onMouseEnter={() => setI(k)} onMouseLeave={() => setI(null)}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.cor }} />
            <span className="text-muted">{p.rotulo}</span>
            <b className="tabular-nums text-foreground">{p.valor}</b>
            <span className="tabular-nums text-muted">{total ? `${Math.round((p.valor / total) * 100)}%` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Minigráfico de linha (evolução no período), sem eixos. */
export function Sparkline({ dados, cor = COR_1, altura = 36 }: { dados: number[]; cor?: string; altura?: number }) {
  if (dados.length < 2) return <div style={{ height: altura }} />;
  const max = Math.max(1, ...dados);
  const min = Math.min(0, ...dados);
  const pts = dados.map((v, k) => `${(k / (dados.length - 1)) * 100},${100 - ((v - min) / (max - min || 1)) * 90 - 5}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height: altura }} aria-hidden>
      <polygon points={`0,100 ${pts} 100,100`} fill={cor} opacity={0.1} />
      <polyline points={pts} fill="none" stroke={cor} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Cartão de número com minigráfico da evolução e variação. */
export function KpiCard({ rotulo, valor, serie, apoio, tom, href }: { rotulo: string; valor: string; serie?: number[]; apoio?: string; tom?: "danger" | "pending" | "success"; href?: string }) {
  const cor = tom === "danger" ? "var(--status-danger)" : tom === "pending" ? "var(--status-pending)" : tom === "success" ? "var(--status-success)" : COR_1;
  const corpo = (
    <>
      <p className="eyebrow">{rotulo}</p>
      <p className="numero-grande mt-1 text-[2rem] leading-none" style={tom ? { color: cor } : undefined}>
        {valor}
      </p>
      {serie && <div className="mt-2">{<Sparkline dados={serie} cor={cor} />}</div>}
      {apoio && <p className="mt-1 text-[11px] text-muted">{apoio}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="ui-card block min-w-0 p-4 transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-border-strong">
      {corpo}
    </Link>
  ) : (
    <div className="ui-card min-w-0 p-4">{corpo}</div>
  );
}

/** Barras horizontais empilhadas por pessoa (ex.: concluídas / em dia / atrasadas). */
export function BarrasPessoas({ linhas, partes }: { linhas: { nome: string; href?: string; valores: number[] }[]; partes: { rotulo: string; cor: string }[] }) {
  const max = Math.max(1, ...linhas.map((l) => l.valores.reduce((s, v) => s + v, 0)));
  return (
    <div className="space-y-3">
      <Legenda itens={partes} />
      {linhas.map((l) => {
        const tot = l.valores.reduce((s, v) => s + v, 0);
        return (
          <div key={l.nome} className="grid grid-cols-[minmax(0,8.5rem)_1fr] items-center gap-3 text-xs">
            {l.href ? (
              <Link href={l.href} className="truncate text-foreground hover:underline">
                {l.nome}
              </Link>
            ) : (
              <span className="truncate text-foreground">{l.nome}</span>
            )}
            <div className="flex items-center gap-2">
              <div className="flex h-3.5 gap-[2px]" style={{ width: `${Math.max(tot ? 3 : 0, (tot / max) * 88)}%` }}>
                {l.valores.map((v, k) => (v ? <div key={k} title={`${partes[k].rotulo}: ${v}`} className="h-full first:rounded-l-[4px] last:rounded-r-[4px]" style={{ flex: v, background: partes[k].cor }} /> : null))}
              </div>
              <span className="tabular-nums text-muted">{tot}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Barras horizontais com link em cada linha (ranking). */
export function Ranking({ dados, sufixo = "" }: { dados: { rotulo: string; valor: number; href?: string; tom?: string }[]; sufixo?: string }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  return (
    <ul className="space-y-2">
      {dados.map((d) => (
        <li key={d.rotulo} className="grid grid-cols-[minmax(0,11rem)_1fr] items-center gap-3 text-xs">
          {d.href ? (
            <Link href={d.href} className="truncate text-foreground hover:underline" title={d.rotulo}>
              {d.rotulo}
            </Link>
          ) : (
            <span className="truncate text-foreground" title={d.rotulo}>
              {d.rotulo}
            </span>
          )}
          <span className="flex items-center gap-2">
            <span className="h-2.5 rounded-r-[4px]" style={{ width: `${Math.max(2, (d.valor / max) * 82)}%`, background: d.tom ?? COR_1 }} />
            <span className="tabular-nums text-muted">
              {d.valor.toLocaleString("pt-BR")}
              {sufixo}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
