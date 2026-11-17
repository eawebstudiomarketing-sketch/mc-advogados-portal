import Link from "next/link";
import type { DetalheMarca, RelatorioMA } from "../../busca-actions";

// Relatório de Viabilidade de Marca no modelo do Marca Acompanhada (17/11/2026):
// cabeçalho com logo e "Gerado em", quadro da marca pesquisada, resumo, Principais
// Anterioridades, Análise por Classe/NCL, Análise Visual, Conclusão e Recomendação,
// Recomendações e Mitigação de Risco, Estimativa de Risco e Detalhes das Marcas Mencionadas.

const AZUL = "#1f5fa8";

/** Texto com **negrito**. */
function T({ children }: { children: string }) {
  const partes = children.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-[#111] dark:text-foreground">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-8 mb-3 text-[19px] font-bold break-after-avoid" style={{ color: AZUL }}>
    {children}
  </h2>
);
const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="mt-5 mb-2 text-[15px] font-bold break-after-avoid" style={{ color: AZUL }}>
    {children}
  </h3>
);
const Pontos = ({ itens }: { itens: string[] }) => (
  <div className="space-y-0.5">
    {itens.map((p, i) => (
      <p key={i}>
        - <T>{p}</T>
      </p>
    ))}
  </div>
);

const AFINIDADE = { alta: "alta afinidade", media: "média afinidade", baixa: "baixa afinidade" } as const;
const CONFLITO = { forte: "Conflito Forte", moderado: "Conflito Moderado", fraco: "Conflito Fraco" } as const;
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

function CartaoMarca({ d }: { d: DetalheMarca }) {
  const linha = (rotulo: string, valor: string | null) =>
    valor ? (
      <p>
        <strong style={{ color: AZUL }}>{rotulo}:</strong> {valor}
      </p>
    ) : null;
  return (
    <div className="break-inside-avoid rounded-md border border-[#d9dee5] bg-white p-4 dark:bg-surface">
      <p className="mb-2 text-[15px] font-bold" style={{ color: AZUL }}>
        <Link href={`/admin/marcas/processos/${d.processo}`} target="_blank" className="hover:underline">
          {d.marca || "(sem nome)"} ({d.processo})
        </Link>
      </p>
      <div className="flex gap-4">
        {d.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo do INPI guardado no Storage
          <img src={d.logo} alt={`Logo ${d.marca}`} className="h-[72px] w-[72px] shrink-0 rounded border border-[#d9dee5] bg-white object-contain p-1" />
        ) : (
          <span className="h-[72px] w-[72px] shrink-0 rounded border border-[#d9dee5] bg-[#f5f7fa]" aria-hidden />
        )}
        <div className="min-w-0 space-y-1 text-[12.5px] leading-snug text-[#222] dark:text-foreground/85">
          {linha("Titular", d.titular)}
          {linha("Classe NCL", d.classe)}
          {linha("Data de Depósito", dataBr(d.deposito))}
          {linha("Tipo", d.tipo)}
          {linha("Natureza", d.natureza)}
          {linha("Situação", d.situacao)}
          {linha("Procurador", d.procurador)}
          {linha("Especificação (resumo)", d.especificacao && d.especificacao.length > 600 ? `${d.especificacao.slice(0, 600)}…` : d.especificacao)}
        </div>
      </div>
    </div>
  );
}

export function RelatorioMarcaAcompanhada({
  r,
  nome,
  entrada,
  geradoEm,
  citados,
  completando,
}: {
  r: RelatorioMA;
  nome: string;
  entrada: { ondeUsar: string; contexto: string; logoUrl?: string | null; classes?: string[] };
  geradoEm: string;
  citados: string[];
  completando: React.ReactNode;
}) {
  const det = r.detalhes ?? {};
  const classeTxt = entrada.classes?.length ? `Classe ${entrada.classes.map((c) => c.padStart(2, "0")).join(", ")}` : entrada.ondeUsar;
  return (
    <article className="mx-auto max-w-[860px] bg-white px-6 py-8 text-[13.5px] leading-relaxed text-[#222] shadow-sm sm:px-10 dark:bg-surface dark:text-foreground/90 print:max-w-none print:p-0 print:shadow-none">
      {/* cabeçalho */}
      <header className="flex items-start gap-5 border-b-2 pb-3" style={{ borderColor: AZUL }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- logo fixo do escritório */}
        <img src="/brand/logo_mc.jpg" alt="MC Advogados" className="h-14 w-14 shrink-0 rounded object-cover" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] leading-tight font-bold" style={{ color: AZUL }}>
            Relatório de Viabilidade de Marca
          </h1>
          <p className="mt-1 text-[12px] text-[#666]">Análise de risco de conflito marcário</p>
        </div>
        <p className="shrink-0 text-[11.5px] text-[#666]">Gerado em: {geradoEm}</p>
      </header>

      {/* marca pesquisada */}
      <section className="mt-5 flex gap-4 rounded-md border border-[#d9dee5] bg-[#f3f6fb] p-4 text-[13px] dark:bg-surface-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p>
            <strong style={{ color: AZUL }}>Marca pesquisada:</strong> {nome}
          </p>
          <p>
            <strong style={{ color: AZUL }}>Uso/Classe pretendida:</strong> {classeTxt}
          </p>
          {entrada.contexto && (
            <p>
              <strong style={{ color: AZUL }}>Contexto adicional:</strong> {entrada.contexto}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[12px] font-bold" style={{ color: AZUL }}>
            Elemento visual
            <br />
            pesquisado:
          </p>
          {entrada.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo enviado na busca
            <img src={entrada.logoUrl} alt="Logo pesquisado" className="mt-1.5 ml-auto h-14 w-14 rounded border border-[#d9dee5] bg-white object-contain p-1" />
          ) : (
            <p className="mt-1 text-[11px] text-[#888]">—</p>
          )}
        </div>
      </section>

      {completando}

      {/* resumo */}
      <section className="mt-5 rounded-md border border-[#d9dee5] bg-[#f3f6fb] p-5 dark:bg-surface-2">
        <p>
          <T>{r.resumo.abertura}</T>
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-6">
          {r.resumo.topicos.map((t, i) => (
            <li key={i}>
              <strong className="font-semibold text-[#111] dark:text-foreground">{t.titulo.replace(/\*\*/g, "")}</strong>: <T>{t.texto}</T>
            </li>
          ))}
        </ul>
        <p className="mt-3">
          <T>{r.resumo.fechamento}</T>
        </p>
      </section>

      <H2>Principais Anterioridades</H2>
      <ul className="space-y-3">
        {r.principais.length === 0 && <li className="text-[#666]">Nenhuma anterioridade relevante encontrada nas classes pesquisadas.</li>}
        {r.principais.map((a) => (
          <li key={a.processo} className="break-inside-avoid">
            <p className="font-semibold text-[#111] dark:text-foreground">
              <span aria-hidden>⚠️</span> {a.marca} – {a.classe} / {AFINIDADE[a.afinidade] ?? a.afinidade}
            </p>
            <p>
              - <strong>Motivo:</strong> <T>{a.motivo}</T> - <strong>Processo:</strong> ({a.processo})
            </p>
          </li>
        ))}
      </ul>
      {r.principaisNota && (
        <p className="mt-3">
          <T>{r.principaisNota}</T>
        </p>
      )}

      <H2>Análise por Classe/NCL</H2>
      {r.porClasse.map((g, i) => (
        <div key={i}>
          <H3>
            {CONFLITO[g.nivel] ?? g.nivel} – {g.titulo}
          </H3>
          {g.introducao && (
            <p className="mb-2">
              <T>{g.introducao}</T>
            </p>
          )}
          {g.itens.map((it, k) => (
            <div key={k} className="mb-3 break-inside-avoid">
              <p className="font-semibold text-[#111] dark:text-foreground">{it.titulo}</p>
              <Pontos itens={it.pontos} />
            </div>
          ))}
          {g.fechamento && (
            <p>
              <T>{g.fechamento}</T>
            </p>
          )}
        </div>
      ))}

      {entrada.logoUrl && (
        <>
          <H2>Análise Visual</H2>
          {r.visual ? (
            <>
              <p>O logo {nome} apresenta:</p>
              <ul className="mt-2 mb-3 list-disc space-y-1 pl-6">
                {r.visual.descricao.map((x, i) => (
                  <li key={i}>
                    <T>{x}</T>
                  </li>
                ))}
              </ul>
              {r.visual.comparacoes.length > 0 ? (
                <>
                  <p className="mb-2">Comparando com os logos das anterioridades:</p>
                  {r.visual.comparacoes.map((c) => (
                    <div key={c.processo} className="mb-3 break-inside-avoid">
                      <p className="font-semibold text-[#111] dark:text-foreground">{c.titulo}</p>
                      <Pontos itens={c.pontos} />
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-[#666]">{r.visual.semLogos ? "O INPI não devolveu logos das anterioridades nesta busca; a comparação visual ficou só com a descrição acima." : "Nenhum logo das anterioridades tem semelhança visual relevante."}</p>
              )}
              {r.visual.fechamento && (
                <p>
                  <T>{r.visual.fechamento}</T>
                </p>
              )}
            </>
          ) : (
            <p className="text-[#666] print:hidden">A análise visual é feita depois que os logos das anterioridades chegam do INPI (acima).</p>
          )}
        </>
      )}

      <H2>Conclusão e Recomendação</H2>
      <H3>Conclusão</H3>
      <ul className="list-disc space-y-1.5 pl-6">
        {r.conclusao.pontos.map((p, i) => (
          <li key={i}>
            <strong className="font-semibold text-[#111] dark:text-foreground">{p.titulo.replace(/\*\*/g, "")}</strong>: <T>{p.texto}</T>
          </li>
        ))}
      </ul>
      <p className="mt-3">
        <T>{r.conclusao.texto}</T>
      </p>

      <H3>Recomendações e Mitigação de Risco</H3>
      {r.recomendacoes.map((b, i) => (
        <div key={i} className="mb-3 break-inside-avoid">
          <ul className="list-disc pl-6">
            <li className="font-semibold text-[#111] dark:text-foreground">{b.titulo.replace(/\*\*/g, "")}</li>
          </ul>
          <Pontos itens={b.pontos} />
        </div>
      ))}

      <H2>Estimativa de Risco</H2>
      <ul className="list-disc pl-6">
        <li className="font-semibold text-[#111] dark:text-foreground">Risco global de indeferimento{entrada.classes?.length ? ` em classe ${entrada.classes[0].padStart(2, "0")}` : ""}:</li>
      </ul>
      <p>
        - <T>{r.estimativa.indeferimento}</T>
      </p>
      <ul className="mt-2 list-disc pl-6">
        <li className="font-semibold text-[#111] dark:text-foreground">Probabilidade de oposição:</li>
      </ul>
      <Pontos itens={r.estimativa.oposicao} />
      <p className="mt-3">
        <T>{r.estimativa.sintese}</T>
      </p>

      <H2>Detalhes Das Marcas Mencionadas</H2>
      <div className="space-y-3">
        {citados.map((p) =>
          det[p] ? (
            <CartaoMarca key={p} d={det[p]} />
          ) : (
            <div key={p} className="rounded-md border border-dashed border-[#d9dee5] p-4 text-[12.5px] text-[#888]">
              Processo {p}: buscando os dados no INPI…
            </div>
          )
        )}
      </div>

      <div className="mt-8 border-t border-[#d9dee5] pt-3 text-[11.5px] text-[#777]">
        Este relatório tem caráter técnico-informativo, feito na base do INPI na data acima. Pedidos depositados há menos de 60 dias podem ainda não aparecer. Recomenda-se a validação final à luz dos dados processuais e do contexto específico do caso.
      </div>
    </article>
  );
}
