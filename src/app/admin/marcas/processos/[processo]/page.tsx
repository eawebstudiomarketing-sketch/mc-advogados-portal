import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Settings2 } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { getMarca, nomeDaMarca } from "@/lib/marcas/dados";
import { BotoesFicha } from "./botoes-ficha";

// Marcas → ficha do processo ("Detalhes da marca" no Marca Acompanhada): dados
// do INPI, previsão das próximas etapas, histórico e publicações na RPI.

const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);
// PDF oficial da revista no site do INPI
const pdfRevista = (rpi: number) => `https://revistas.inpi.gov.br/pdf/Marcas${rpi}.pdf`;
const pepi = (processo: string) => `https://busca.inpi.gov.br/pePI/servlet/MarcasServletController?Action=searchMarca&tipoPesquisa=BY_NUM_PROC&NumPedido=${processo}`;

export default async function FichaMarcaPage({ params }: { params: Promise<{ processo: string }> }) {
  await exigirPermissao("marcas");
  const { processo } = await params;
  const r = await getMarca(processo);
  if (!r) notFound();
  const { marca: m, publicacoes, prazos, colidencias } = r;
  const nome = nomeDaMarca(m);

  const linha = (rotulo: string, valor: React.ReactNode) =>
    valor ? (
      <p className="text-sm">
        <span className="text-muted">{rotulo}:</span> <span className="text-foreground">{valor}</span>
      </p>
    ) : null;

  return (
    <div className="space-y-5 print:space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Marcas · Detalhes da marca</p>
          <h1 className="page-title">{nome}</h1>
          <p className="text-sm text-muted">
            Informações sobre a marca {nome} <span className="font-mono">[{m.processo}]</span>
          </p>
        </div>
        <Link href="/admin/marcas/processos" className="ui-btn-secondary print:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
        </Link>
      </div>

      <section className="ui-card p-5">
        <div className="grid gap-5 md:grid-cols-[160px_1fr]">
          <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-border">
            {m.imagem ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo do INPI
              <img src={m.imagem} alt={`Logo da marca ${nome}`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="px-3 text-center text-xs text-muted">{m.apresentacao?.toLowerCase().includes("nominativa") ? "Marca nominativa (sem imagem)" : "Sem imagem"}</span>
            )}
          </div>
          <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {linha("Marca", nome)}
            {linha("Processo", <span className="font-mono">{m.processo}</span>)}
            {linha("Tipo", m.apresentacao ? `Marca ${m.apresentacao.replace(/^marca\s+/i, "")}` : null)}
            <div className="sm:col-span-2">{linha("Situação do processo", <strong className="font-semibold">{m.situacao ?? "—"}</strong>)}</div>
            <div className="sm:col-span-2">{linha("Titular", [m.titular, m.titular_uf].filter(Boolean).join(" / "))}</div>
            <div className="sm:col-span-2">{linha("Procurador", m.procurador)}</div>
            {linha("Data de depósito", dataBR(m.deposito))}
            {linha("Data de concessão", dataBR(m.concessao))}
            {linha("Data de vigência", dataBR(m.vigencia))}
            {linha("Classe", m.classe)}
            {linha("Natureza", m.natureza)}
            {linha("Status da classe", m.status_classe)}
            <div className="sm:col-span-2">{linha("Especificação", m.especificacao)}</div>
            <div className="sm:col-span-2">{linha("CFE(4)", m.cfe)}</div>
            <div className="sm:col-span-2">{linha("Cliente", m.clients?.name ?? m.contato_nome)}</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4 print:hidden">
          <BotoesFicha processo={m.processo} nome={nome} />
          <Link href={`/admin/marcas/configurar?processo=${m.processo}`} className="ui-btn-secondary">
            <Settings2 className="h-4 w-4" aria-hidden /> Configurar acompanhamento
          </Link>
          <a href={pepi(m.processo)} target="_blank" rel="noreferrer" className="ui-btn-secondary">
            <ExternalLink className="h-4 w-4" aria-hidden /> Ver no INPI
          </a>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="ui-card p-5">
          <h2 className="section-title">Previsão das próximas etapas</h2>
          {m.previsao ? <p className="mt-2 text-sm whitespace-pre-line text-foreground/85">{m.previsao}</p> : <p className="mt-2 text-sm text-muted">Sem etapas previstas para a situação atual.</p>}
          <p className="mt-3 text-[11px] text-muted">Estimativas calculadas a partir do ritmo atual de processamento do INPI nas últimas revistas da RPI. Os prazos reais podem variar conforme as particularidades de cada processo.</p>
          {prazos.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="eyebrow mb-1.5">Prazos administrativos</p>
              <ul className="space-y-1">
                {prazos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground/85">{p.acao}</span>
                    <span className={`tabular-nums ${p.situacao === "pendente" ? "font-semibold text-foreground" : "text-muted line-through"}`}>{dataBR(p.vence_em)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="ui-card p-5">
          <h2 className="section-title">Histórico de publicações</h2>
          {publicacoes.length ? (
            <ol className="mt-3 space-y-3 border-l-2 border-border pl-4">
              {publicacoes.map((p) => (
                <li key={p.id} className="relative">
                  <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-navy ring-2 ring-surface" aria-hidden />
                  <p className="text-sm font-medium text-foreground">{p.despacho}</p>
                  <p className="text-xs text-muted">
                    {dataBR(p.data)} - RPI {p.rpi}
                  </p>
                  {p.info && <p className="mt-0.5 text-xs text-foreground/75">{p.info}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted">Nenhuma publicação ainda.</p>
          )}
        </section>
      </div>

      <section className="ui-card overflow-hidden">
        <h2 className="section-title border-b border-border px-5 py-3">Publicações no INPI</h2>
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="px-4 py-2.5">RPI</th>
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5">Cód.</th>
                <th className="px-4 py-2.5">Despacho</th>
                <th className="px-4 py-2.5">Outras informações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {publicacoes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">
                    Nenhuma publicação.
                  </td>
                </tr>
              )}
              {publicacoes.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 text-sm">
                    <a href={pdfRevista(p.rpi)} target="_blank" rel="noreferrer" className="text-status-info hover:underline">
                      {p.rpi}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 text-sm tabular-nums">{dataBR(p.data)}</td>
                  <td className="px-4 py-2.5 text-sm tabular-nums">{p.codigo}</td>
                  <td className="px-4 py-2.5 text-sm">{p.despacho}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground/75">{p.info}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ui-card p-5">
        <h2 className="section-title">Petições do processo</h2>
        <p className="mt-2 text-sm text-muted">
          As petições (protocolo, serviço, pagamento) vêm do INPI.{" "}
          <a href={pepi(m.processo)} target="_blank" rel="noreferrer" className="ui-link">
            Abrir as petições no INPI
          </a>
        </p>
      </section>

      <section className="ui-card p-5">
        <h2 className="section-title">Colidências</h2>
        {colidencias.length ? (
          <ul className="mt-3 divide-y divide-border">
            {colidencias.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.risco === "alto" ? "bg-status-danger-bg text-status-danger" : c.risco === "medio" ? "bg-status-pending-bg text-status-pending" : "bg-surface-2 text-muted"}`}>
                  Risco {c.risco === "medio" ? "médio" : c.risco}
                </span>
                <span className="font-medium">{c.nome}</span>
                <span className="font-mono text-xs text-muted">{c.processo}</span>
                <span className="text-xs text-muted">
                  {c.classe} · RPI {c.rpi}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Nenhuma marca parecida encontrada nas últimas revistas.</p>
        )}
      </section>
    </div>
  );
}
