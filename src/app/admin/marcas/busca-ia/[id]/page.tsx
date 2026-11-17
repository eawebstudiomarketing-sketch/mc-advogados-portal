import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import type { Parecer, Pesquisa, RelatorioMA } from "../../busca-actions";
import { BotaoImprimir } from "./botao-imprimir";
import { CompletarRelatorio } from "./completar";
import { RelatorioMarcaAcompanhada } from "./relatorio-ma";

// Relatório de Busca (Busca com IA), 09/11/2026: a parte das pesquisas segue o
// resultado do pePI do INPI ("RESULTADO DA PESQUISA (data às hora)", "Marca:",
// "Foram encontrados N processos…", tabela verde/cinza com Número, Prioridade,
// apresentação, Marca, ®, Situação, Titular, Classe); depois vem o parecer da IA.
// Imprimir / Ctrl+P = PDF para o cliente.

// a página completa os dados/logos do INPI por ações do servidor (cada uma pode levar ~1 min)
export const maxDuration = 120;

const RISCO = {
  baixo: { rotulo: "Risco baixo", cls: "bg-status-success-bg text-status-success" },
  medio: { rotulo: "Risco médio", cls: "bg-status-pending-bg text-status-pending" },
  alto: { rotulo: "Risco alto", cls: "bg-status-danger-bg text-status-danger" },
} as const;

type Encontrado = { processo: string; marca: string; situacao: string; titular: string; classes: string; deposito: string | null; apresentacao?: string | null; relevancia: number; termos?: string[] };

const quandoINPI = (iso: string) => {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
  return `${dia} às ${hora}`;
};
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** Ícone da apresentação como no pePI (N nominativa, M mista, F figurativa, T tridimensional). */
function Apresentacao({ tipo }: { tipo?: string | null }) {
  if (!tipo) return null;
  const letra = tipo.charAt(0).toUpperCase();
  const cor = { N: "#1f5fbf", M: "#b3261e", F: "#2e7d32", T: "#5f6368", D: "#7b1fa2" }[letra] ?? "#5f6368";
  return (
    <span title={`Marca ${tipo}`} className="inline-grid h-[18px] w-[18px] place-items-center rounded-full text-[10px] font-bold text-white italic" style={{ background: cor }}>
      {letra}
    </span>
  );
}

const registrada = (s: string) => /em vigor|registrad/i.test(s) && !/nul|extint|arquiv|indefer/i.test(s);

/** Tabela no padrão do pePI. */
function TabelaINPI({ linhas, destaque }: { linhas: Encontrado[]; destaque: Set<string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[1px] text-[12px] text-[#111] print:text-[10px]">
        <thead>
          <tr className="bg-[#B5D6AD] text-center font-bold">
            <th className="px-1.5 py-1">Número</th>
            <th className="px-1.5 py-1">Prioridade</th>
            <th className="px-1 py-1" aria-label="Apresentação" />
            <th className="px-1.5 py-1">Marca</th>
            <th className="px-1 py-1" aria-label="Registrada" />
            <th className="px-1.5 py-1">Situação</th>
            <th className="px-1.5 py-1">Titular</th>
            <th className="px-1.5 py-1">Classe</th>
            <th className="px-1.5 py-1" title="Semelhança com a marca pretendida (gráfica e fonética)">
              Semelh.
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.processo} className={destaque.has(l.processo) ? "bg-[#FFE9B3]" : "bg-[#E0E0E0]"}>
              <td className="px-1.5 py-1 tabular-nums text-[#1a5e8a]">
                <Link href={`/admin/marcas/processos/${l.processo}`} target="_blank" className="hover:underline">
                  {l.processo}
                </Link>
              </td>
              <td className="px-1.5 py-1 tabular-nums">{dataBr(l.deposito)}</td>
              <td className="px-1 py-1 text-center">
                <Apresentacao tipo={l.apresentacao} />
              </td>
              <td className="px-1.5 py-1 font-bold">{l.marca || "—"}</td>
              <td className="px-1 py-1 text-center">{registrada(l.situacao) ? <span className="text-[13px] text-[#3949ab]" title="Marca registrada">®</span> : null}</td>
              <td className="px-1.5 py-1">{l.situacao}</td>
              <td className="px-1.5 py-1">{l.titular}</td>
              <td className="px-1.5 py-1 whitespace-nowrap">{l.classes}</td>
              <td className="px-1.5 py-1 text-right tabular-nums">{l.relevancia}%</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr className="bg-[#E0E0E0]">
              <td colSpan={9} className="px-2 py-3 text-center">
                Nenhum processo parecido nas classes pesquisadas.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default async function RelatorioBuscaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imprimir?: string }> }) {
  await exigirPermissao("marcas");
  const { id } = await params;
  const { imprimir } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = (await createClient()) as unknown as SupabaseClient;
  const { data } = await sb.from("marca_buscas").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  // 17/11/2026: relatórios novos no modelo do Marca Acompanhada; os antigos continuam no formato anterior
  if ((data.resultado as { formato?: string }).formato === "ma") {
    const rm = data.resultado as RelatorioMA;
    const ent = data.entrada as { ondeUsar: string; contexto: string; logoUrl?: string | null; classes?: string[] };
    const citados: string[] = [];
    for (const p of [...rm.principais.map((a) => a.processo), ...rm.porClasse.flatMap((g) => g.itens.flatMap((i) => i.processos))]) if (!citados.includes(p)) citados.push(p);
    const lista = citados.slice(0, 25);
    const faltam = lista.filter((p) => !rm.detalhes?.[p]).length;
    const gerado = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(data.created_at));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <nav className="flex items-center gap-1.5 text-[13px] text-muted" aria-label="Caminho">
            <Link href="/admin/marcas/busca-ia" className="text-navy-3 hover:underline">
              Busca com IA
            </Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden /> Relatório de viabilidade
          </nav>
          <BotaoImprimir automatico={imprimir === "1" && !faltam} />
        </div>
        <RelatorioMarcaAcompanhada
          r={rm}
          nome={data.nome}
          entrada={ent}
          geradoEm={gerado}
          citados={lista}
          completando={<CompletarRelatorio id={id} total={lista.length} faltam={faltam} visualPendente={!!ent.logoUrl && !rm.visual} />}
        />
      </div>
    );
  }
  const r = data.resultado as Parecer & { termos?: string[]; encontrados?: Encontrado[]; pesquisas?: Pesquisa[]; classesPesquisadas?: string[] };
  const e = data.entrada as { nome: string; ondeUsar: string; contexto: string; textoLogo: string; siglas: boolean };
  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(data.created_at));
  const encontrados = (r.encontrados ?? []).slice().sort((a, b) => b.relevancia - a.relevancia);
  const relevantes = new Set(r.anterioridades.map((a) => a.processo));
  const classes = r.classesPesquisadas ?? r.classes.map((c) => c.classe);

  return (
    <div className="ficha-marca space-y-5">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted print:hidden" aria-label="Caminho">
        <Link href="/admin/marcas/busca-ia" className="text-navy-3 hover:underline">
          Busca com IA
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden /> Relatório de busca
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">MC Advogados · Marcas</p>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Relatório de Busca de Anterioridade e Viabilidade</h1>
          <p className="mt-1 text-sm text-muted">
            Marca <strong className="text-foreground">{data.nome}</strong> · pesquisa de {quando}
          </p>
        </div>
        <BotaoImprimir automatico={imprimir === "1"} />
      </div>

      {/* critérios */}
      <section className="ui-card p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-foreground">Critérios da pesquisa</h2>
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-muted">Marca pretendida: </dt>
            <dd className="inline font-semibold">{data.nome}</dd>
          </div>
          <div>
            <dt className="inline text-muted">Classes (NCL 12ª ed.): </dt>
            <dd className="inline">{classes.join(", ") || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="inline text-muted">Onde será usada: </dt>
            <dd className="inline">{e.ondeUsar}</dd>
          </div>
          {e.contexto && (
            <div className="sm:col-span-2">
              <dt className="inline text-muted">Contexto: </dt>
              <dd className="inline">{e.contexto}</dd>
            </div>
          )}
          {e.textoLogo && (
            <div>
              <dt className="inline text-muted">Texto do logo: </dt>
              <dd className="inline">{e.textoLogo}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="inline text-muted">Termos pesquisados no INPI: </dt>
            <dd className="inline">{(r.termos ?? []).map((t) => `"${t}"`).join(", ")} (pesquisa radical em todas as classes; ficam os parecidos nas classes acima)</dd>
          </div>
        </dl>
      </section>

      {/* resultado da pesquisa, como no pePI */}
      <section className="ui-card space-y-5 p-5 print:break-before-auto">
        <h2 className="text-[15px] font-semibold text-foreground">Resultado da pesquisa no INPI</h2>
        {r.pesquisas?.length ? (
          r.pesquisas.map((p) => {
            const daqui = encontrados.filter((x) => (x.termos ? x.termos.includes(p.termo) : p.processos.includes(x.processo)));
            return (
              <div key={p.termo} className="space-y-1.5">
                <div className="text-[13px] leading-snug text-[#111] dark:text-foreground">
                  <p>
                    <strong>RESULTADO DA PESQUISA</strong> ({quandoINPI(p.em)})
                  </p>
                  <p>
                    <strong>Marca:</strong> &quot;{p.termo}&quot; <span className="text-muted">· pesquisa {p.tipo.toLowerCase()}</span>
                  </p>
                  <p>
                    Foram encontrados <strong>{p.total}</strong> processos que satisfazem à pesquisa.{" "}
                    <span className="text-muted">
                      Mostrando os {daqui.length} parecidos (semelhança ≥ 45%) nas classes pesquisadas. Fonte: {p.fonte}.
                    </span>
                  </p>
                </div>
                <TabelaINPI linhas={daqui} destaque={relevantes} />
              </div>
            );
          })
        ) : (
          <TabelaINPI linhas={encontrados} destaque={relevantes} />
        )}
        <p className="flex items-center gap-2 text-[11px] text-muted">
          <span className="inline-block h-3 w-5 rounded-sm bg-[#FFE9B3]" aria-hidden /> Em amarelo: anterioridades que pesam no parecer abaixo.
        </p>
      </section>

      {/* parecer */}
      <section className="ui-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-foreground">Parecer de viabilidade</h2>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${RISCO[r.risco]?.cls ?? ""}`}>{RISCO[r.risco]?.rotulo ?? r.risco}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-foreground">{r.resumo}</p>
      </section>

      <section className="ui-card overflow-hidden">
        <h2 className="border-b border-border px-6 py-4 text-[15px] font-semibold text-foreground">Análise por classe (NCL)</h2>
        <ul className="divide-y divide-border">
          {r.classes.map((c) => (
            <li key={c.classe} className="px-6 py-3.5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                Classe {c.classe}
                <span className={`rounded-full px-2 py-0.5 text-xs ${RISCO[c.risco]?.cls ?? ""}`}>{RISCO[c.risco]?.rotulo ?? c.risco}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">{c.motivo}</p>
              <p className="mt-1 text-sm text-foreground/85">{c.comentario}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="ui-card overflow-hidden">
        <h2 className="border-b border-border px-6 py-4 text-[15px] font-semibold text-foreground">Anterioridades que pesam</h2>
        <ul className="divide-y divide-border">
          {r.anterioridades.length === 0 && <li className="px-6 py-5 text-sm text-muted">Nenhuma anterioridade relevante encontrada.</li>}
          {r.anterioridades.map((a) => (
            <li key={a.processo} className="px-6 py-3.5 text-sm">
              <p className="font-semibold text-foreground">
                {a.marca} <span className="font-normal text-muted">· processo {a.processo} · {a.classe} · {a.situacao}</span>
              </p>
              <p className="text-xs text-muted">{a.titular}</p>
              <p className="mt-1 text-foreground/85">{a.motivo}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="ui-card p-6">
        <h2 className="text-[15px] font-semibold text-foreground">Recomendações</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-foreground/85">
          {r.recomendacoes.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
        <p className="mt-4 border-t border-border pt-3 text-[11px] text-muted">
          Pesquisa feita na base do INPI na data acima. Pedidos depositados há menos de 60 dias podem ainda não aparecer. A análise de colidência é uma estimativa e não garante o deferimento.
        </p>
      </section>
    </div>
  );
}
