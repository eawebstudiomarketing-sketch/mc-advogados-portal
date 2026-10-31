import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import type { Parecer } from "../../busca-actions";
import { BotaoImprimir } from "./botao-imprimir";

// Relatório de Viabilidade (Busca com IA). Imprimir / Ctrl+P = PDF para o cliente.

const RISCO = {
  baixo: { rotulo: "Risco baixo", cls: "bg-status-success-bg text-status-success" },
  medio: { rotulo: "Risco médio", cls: "bg-status-pending-bg text-status-pending" },
  alto: { rotulo: "Risco alto", cls: "bg-status-danger-bg text-status-danger" },
} as const;

export default async function RelatorioBuscaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imprimir?: string }> }) {
  await exigirPermissao("marcas");
  const { id } = await params;
  const { imprimir } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = (await createClient()) as unknown as SupabaseClient;
  const { data } = await sb.from("marca_buscas").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data.resultado as Parecer & { termos?: string[] };
  const e = data.entrada as { nome: string; ondeUsar: string; contexto: string; textoLogo: string; siglas: boolean };
  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(data.created_at));

  return (
    <div className="ficha-marca space-y-5">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted print:hidden" aria-label="Caminho">
        <Link href="/admin/marcas/busca-ia" className="text-navy-3 hover:underline">
          Busca com IA
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden /> Relatório de Viabilidade
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Relatório de Viabilidade</h1>
          <p className="mt-1 text-sm text-muted">
            Marca <strong className="text-foreground">{data.nome}</strong> · pesquisa de {quando}
          </p>
        </div>
        <BotaoImprimir automatico={imprimir === "1"} />
      </div>

      <section className="ui-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${RISCO[r.risco]?.cls ?? ""}`}>{RISCO[r.risco]?.rotulo ?? r.risco}</span>
          {r.termos?.length ? <span className="text-xs text-muted">Termos pesquisados no INPI: {r.termos.join(", ")}</span> : null}
        </div>
        <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-foreground">{r.resumo}</p>
        <dl className="mt-4 grid gap-x-6 gap-y-1 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-muted">Onde será usada: </dt>
            <dd className="inline">{e.ondeUsar}</dd>
          </div>
          {e.contexto && (
            <div>
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
        </dl>
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
        <h2 className="border-b border-border px-6 py-4 text-[15px] font-semibold text-foreground">Anterioridades relevantes no INPI</h2>
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="px-4 py-2.5">Rel.</th>
                <th className="px-4 py-2.5">Processo</th>
                <th className="px-4 py-2.5">Marca</th>
                <th className="px-4 py-2.5">Classe</th>
                <th className="px-4 py-2.5">Situação</th>
                <th className="px-4 py-2.5">Por que pesa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.anterioridades.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-muted">
                    Nenhuma anterioridade relevante encontrada.
                  </td>
                </tr>
              )}
              {r.anterioridades.map((a) => (
                <tr key={a.processo} className="align-top">
                  <td className="px-4 py-2.5 text-sm tabular-nums">{a.relevancia}%</td>
                  <td className="px-4 py-2.5 text-sm tabular-nums">{a.processo}</td>
                  <td className="px-4 py-2.5 text-sm font-medium">
                    {a.marca}
                    <span className="block text-xs font-normal text-muted">{a.titular}</span>
                  </td>
                  <td className="px-4 py-2.5 text-sm">{a.classe}</td>
                  <td className="px-4 py-2.5 text-sm">{a.situacao}</td>
                  <td className="px-4 py-2.5 text-sm">{a.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
