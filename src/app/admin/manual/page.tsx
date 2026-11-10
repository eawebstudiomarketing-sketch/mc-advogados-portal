import Link from "next/link";
import { ArrowUpRight, Lightbulb } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { CAPITULOS, PERGUNTAS, PRIMEIROS_PASSOS } from "@/lib/manual/conteudo";
import { ImprimirManual } from "./imprimir";

// Manual do portal (09/11/2026): o sistema inteiro, um capítulo por item do
// menu, com print (dados borrados), para que serve, passo a passo e dicas.
// "Gerar PDF" imprime tudo (cada capítulo começa numa página nova).

export const metadata = { title: "Manual · MC Advogados" };

export default async function ManualPage() {
  await requireRole(["admin", "advogado"]);
  return (
    <div className="manual space-y-10">
      <style>{`
        @media print {
          .manual-capitulo { break-before: page; }
          .manual-tela { break-inside: avoid; }
          .manual img { max-height: 120mm; object-fit: contain; }
          [aria-label="Assistente do portal"], button:has(svg.lucide-sparkles) { display: none !important; }
        }
      `}</style>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Ajuda</p>
          <h1 className="page-title">Manual do portal</h1>
          <p className="max-w-2xl text-sm text-muted">Como usar cada parte do portal da MC Advogados. Os prints mostram as telas com os dados pessoais borrados. Cada pessoa vê só as telas que tem permissão.</p>
        </div>
        <ImprimirManual />
      </header>

      <nav aria-label="Sumário" className="ui-card p-5">
        <h2 className="section-title mb-3">Sumário</h2>
        <ol className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <li>
            <a href="#primeiros-passos" className="ui-link">
              Primeiros passos
            </a>
          </li>
          {CAPITULOS.map((c, i) => (
            <li key={c.id}>
              <a href={`#${c.id}`} className="ui-link">
                {i + 1}. {c.titulo}
              </a>
            </li>
          ))}
          <li>
            <a href="#perguntas" className="ui-link">
              Perguntas frequentes
            </a>
          </li>
        </ol>
      </nav>

      <section id="primeiros-passos" aria-labelledby="pp" className="scroll-mt-20">
        <h2 id="pp" className="mb-4 text-[22px] font-semibold text-foreground">
          Primeiros passos
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRIMEIROS_PASSOS.map((x) => (
            <div key={x.titulo} className="ui-card p-4">
              <dt className="text-sm font-semibold text-foreground">{x.titulo}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-foreground/80">{x.texto}</dd>
            </div>
          ))}
        </dl>
      </section>

      {CAPITULOS.map((c, i) => (
        <section key={c.id} id={c.id} aria-labelledby={`cap-${c.id}`} className="manual-capitulo scroll-mt-20 space-y-5">
          <div className="border-b border-border pb-3">
            <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">Capítulo {i + 1}</p>
            <h2 id={`cap-${c.id}`} className="text-[24px] font-semibold text-foreground">
              {c.titulo}
            </h2>
            <p className="text-sm text-muted">
              {c.onde} · {c.resumo}
            </p>
          </div>
          {c.telas.map((t) => (
            <article key={t.titulo} className="manual-tela ui-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                <h3 className="text-[17px] font-semibold text-foreground">{t.titulo}</h3>
                {t.href && (
                  <Link href={t.href} className="inline-flex items-center gap-1 text-sm font-medium text-navy-3 hover:underline print:hidden">
                    Abrir esta tela <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                )}
              </div>
              <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                {t.print && (
                  <a href={t.print} target="_blank" rel="noopener noreferrer" className="block self-start overflow-hidden rounded-lg border border-border bg-surface-2" title="Ver o print em tamanho grande">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.print} alt={`Tela ${t.titulo} (dados borrados)`} loading="lazy" className="w-full" />
                  </a>
                )}
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="mb-1 text-xs font-semibold tracking-[0.08em] text-muted uppercase">Para que serve</h4>
                    <p className="leading-relaxed text-foreground">{t.praQue}</p>
                  </div>
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold tracking-[0.08em] text-muted uppercase">Passo a passo</h4>
                    <ol className="list-decimal space-y-1.5 pl-5 leading-relaxed text-foreground/90">
                      {t.passos.map((x, j) => (
                        <li key={j}>{x}</li>
                      ))}
                    </ol>
                  </div>
                  {t.dicas?.length ? (
                    <div className="rounded-lg bg-gold-soft p-3 text-gold-ink">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] uppercase">
                        <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Dicas
                      </p>
                      <ul className="list-disc space-y-1 pl-5 leading-relaxed">
                        {t.dicas.map((x, j) => (
                          <li key={j}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </section>
      ))}

      <section id="perguntas" aria-labelledby="pf" className="manual-capitulo scroll-mt-20">
        <h2 id="pf" className="mb-4 text-[22px] font-semibold text-foreground">
          Perguntas frequentes
        </h2>
        <dl className="space-y-3">
          {PERGUNTAS.map((x) => (
            <div key={x.p} className="ui-card p-4">
              <dt className="text-sm font-semibold text-foreground">{x.p}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-foreground/80">{x.r}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs text-muted">Manual atualizado em 10/11/2026. As mudanças seguintes aparecem em Caixa de entrada → Novidades.</p>
      </section>
    </div>
  );
}
