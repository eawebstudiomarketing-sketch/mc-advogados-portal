import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { getMarca, nomeDaMarca } from "@/lib/marcas/dados";
import { etapasDaPrevisao } from "@/lib/marcas/previsao";
import { BotoesFicha } from "./botoes-ficha";
import { PeticoesProcesso } from "./peticoes";
import { MostrarEspecificacao } from "./mostrar-especificacao";
import { FichaPatente } from "./ficha-patente";
import { PreviaForaDaCarteira } from "./previa-fora-da-carteira";

// Marcas → ficha do processo ("Detalhes da marca" no Marca Acompanhada, mesmo
// desenho). Ctrl+P / botão Imprimir nesta página gera o PDF que vai para o
// cliente: o menu, o topo e os botões somem na impressão.

const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);
// PDF oficial da revista no site do INPI
const pdfRevista = (rpi: number) => `https://revistas.inpi.gov.br/pdf/Marcas${rpi}.pdf`;

export default async function FichaMarcaPage({ params }: { params: Promise<{ processo: string }> }) {
  await exigirPermissao("marcas");
  const { processo } = await params;
  const r = await getMarca(processo);
  if (!r) {
    // fora da carteira (resultado de busca): prévia pela base das revistas
    const num = decodeURIComponent(processo).replace(/\D/g, "");
    if (num.length >= 6) return <PreviaForaDaCarteira processo={num} />;
    notFound();
  }
  const { marca: m, publicacoes, prazos, colidencias } = r;
  if (m.tipo === "patente") return <FichaPatente m={m} publicacoes={publicacoes} prazos={prazos} />;
  const nome = nomeDaMarca(m);
  const etapas = etapasDaPrevisao(m.previsao);
  // prazo administrativo em aberto também aparece na previsão (como no MA)
  const pendentes = prazos.filter((p) => p.situacao === "pendente");
  const historico = [...publicacoes].sort((a, b) => a.rpi - b.rpi);
  const tabela = historico;

  const bloco = (filhos: React.ReactNode) => <div className="border-b border-border py-3 text-sm leading-relaxed last:border-b-0">{filhos}</div>;

  return (
    <div className="ficha-marca space-y-5 print:space-y-4">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted print:hidden" aria-label="Caminho">
        <Link href="/admin/marcas" className="text-navy-3 hover:underline">
          Principal
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <Link href="/admin/marcas/processos" className="hover:underline">
          Marcas
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span>Detalhes da marca</span>
      </nav>
      <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Detalhes da marca</h1>

      <section className="ui-card overflow-hidden">
        <h2 className="border-b border-border px-6 py-4 text-[15px] font-semibold text-foreground">
          Informações sobre a marca {nome} [{m.processo}]
        </h2>
        <div className="grid gap-6 p-6 lg:grid-cols-[200px_1fr_300px] print:grid-cols-[160px_1fr_230px] print:gap-4 print:p-4">
          {/* logo entre as duas linhas verticais */}
          <div className="flex h-44 items-center justify-center border-x border-border px-3 print:h-36">
            {m.imagem ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo do INPI
              <img src={m.imagem} alt={`Logo da marca ${nome}`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-center text-xs text-muted">{m.apresentacao?.toLowerCase().includes("nominativa") ? "Marca nominativa" : "Sem imagem"}</span>
            )}
          </div>

          <div className="min-w-0">
            {bloco(
              <div className="grid grid-cols-2 gap-4">
                <p>Marca: {nome}</p>
                <p>Processo: {m.processo}</p>
              </div>
            )}
            {bloco(
              <>
                <p>Tipo: {m.apresentacao ? `Marca ${m.apresentacao.replace(/^marca\s+/i, "")}` : "—"}</p>
                <p>Situação do processo: {m.situacao ?? "—"}</p>
              </>
            )}
            {bloco(
              <>
                <p>
                  Titular: <span className="text-navy-3">{m.titular ?? "—"}</span>
                  {m.titular_uf ? ` BR / ${m.titular_uf}` : ""}
                </p>
                <p>
                  Procurador: <span className="text-navy-3">{m.procurador ?? "—"}</span>
                </p>
              </>
            )}
            {bloco(
              <div className="grid grid-cols-2 gap-4">
                <p>Data de depósito: {dataBR(m.deposito) ?? "—"}</p>
                {m.concessao && <p>Data de concessão: {dataBR(m.concessao)}</p>}
                {m.vigencia && <p>Data de vigência: {dataBR(m.vigencia)}</p>}
              </div>
            )}
            {bloco(
              <>
                <div className="grid grid-cols-2 gap-4">
                  <p>Classe: {m.classe ?? "—"}</p>
                  <p>Natureza: {m.natureza ?? "—"}</p>
                </div>
                {m.status_classe && <p>Status da classe: {m.status_classe}</p>}
                {m.especificacao && <MostrarEspecificacao texto={m.especificacao} />}
              </>
            )}
            {m.cfe && bloco(<p>CFE(4): {m.cfe}</p>)}
            {(m.clients?.name || m.contato_nome) && bloco(<p>Cliente: {m.clients?.name ?? m.contato_nome}</p>)}
          </div>

          <div className="space-y-4">
            <div className="rounded-[10px] border border-border">
              <h3 className="border-b border-border px-5 py-3.5 text-center text-sm font-semibold text-foreground">Previsão das próximas etapas</h3>
              <div className="px-5 py-4">
                {pendentes.length === 0 && etapas.length === 0 ? (
                  <p className="text-sm text-muted">Sem etapas previstas para a situação atual.</p>
                ) : (
                  <ol className="space-y-4">
                    {pendentes.map((p) => (
                      <Etapa key={p.id} etapa={p.acao} quando={dataBR(p.vence_em) ?? ""} detalhe="prazo legal" />
                    ))}
                    {etapas
                      .filter((e) => !pendentes.some((p) => dataBR(p.vence_em) === e.quando))
                      .map((e, i) => (
                        <Etapa key={i} etapa={e.etapa} quando={e.quando} detalhe={e.detalhe} />
                      ))}
                  </ol>
                )}
                <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">
                  Estimativas calculadas a partir do ritmo atual de processamento do INPI nas últimas revistas da RPI. Os prazos reais podem variar conforme as particularidades de cada processo.
                </p>
              </div>
            </div>

            <div className="rounded-[10px] border border-border">
              <h3 className="border-b border-border px-5 py-3.5 text-center text-sm font-semibold text-foreground">Histórico de publicações</h3>
              <ol className="space-y-3 px-5 py-4">
                {historico.length === 0 && <li className="text-sm text-muted">Nenhuma publicação ainda.</li>}
                {historico.map((p) => (
                  <li key={p.id} className="border-l-2 border-navy-3 pl-3">
                    <p className="text-sm text-foreground">{p.despacho}</p>
                    <p className="text-xs text-muted">
                      {dataBR(p.data)} - RPI {p.rpi}
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col gap-2 print:hidden">
              <BotoesFicha processo={m.processo} nome={nome} />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-card overflow-hidden">
        <h2 className="border-b border-border px-6 py-4 text-[15px] font-semibold text-foreground">Publicações no INPI</h2>
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="px-5 py-2.5">RPI</th>
                <th className="px-5 py-2.5">Data</th>
                <th className="px-5 py-2.5">Cód.</th>
                <th className="px-5 py-2.5">Despacho</th>
                <th className="px-5 py-2.5">Outras informações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tabela.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-muted">
                    Nenhuma publicação.
                  </td>
                </tr>
              )}
              {tabela.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="px-5 py-3 text-sm">
                    <a href={pdfRevista(p.rpi)} target="_blank" rel="noreferrer" className="text-navy-3 hover:underline">
                      {p.rpi}
                    </a>
                  </td>
                  <td className="px-5 py-3 text-sm tabular-nums">{dataBR(p.data)}</td>
                  <td className="px-5 py-3 text-sm tabular-nums">{p.codigo}</td>
                  <td className="px-5 py-3 text-sm">{p.despacho}</td>
                  <td className="px-5 py-3 text-sm">{p.info}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ui-card overflow-hidden">
        <h2 className="border-b border-border px-6 py-4 text-[15px] font-semibold text-foreground">Petições do processo</h2>
        <PeticoesProcesso processo={m.processo} />
      </section>

      <section className="ui-card overflow-hidden">
        <h2 className="border-b border-border px-6 py-4 text-[15px] font-semibold text-foreground">Colidências</h2>
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="px-5 py-2.5">RPI</th>
                <th className="px-5 py-2.5">Processo</th>
                <th className="px-5 py-2.5">Título</th>
                <th className="px-5 py-2.5">Classe</th>
                <th className="px-5 py-2.5 print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {colidencias.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-muted">
                    Nenhuma colidência encontrada.
                  </td>
                </tr>
              )}
              {colidencias.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3 text-sm">{c.rpi}</td>
                  <td className="px-5 py-3 text-sm tabular-nums">{c.processo}</td>
                  <td className="px-5 py-3 text-sm">{c.nome}</td>
                  <td className="px-5 py-3 text-sm">{c.classe}</td>
                  <td className="px-5 py-3 text-sm print:hidden">
                    <Link href={`/admin/marcas/colidencias?processo=${m.processo}`} className="text-navy-3 hover:underline">
                      Analisar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Etapa({ etapa, quando, detalhe }: { etapa: string; quando: string; detalhe: string | null }) {
  return (
    <li className="relative pl-8">
      <span className="absolute top-0.5 left-0 h-4 w-4 rounded-full border-[3px] border-foreground/80 bg-surface" aria-hidden />
      <p className="text-sm text-foreground">{etapa}</p>
      {quando && <p className="text-sm font-semibold text-foreground">{quando}</p>}
      {detalhe && <p className="text-xs text-muted">{detalhe}</p>}
    </li>
  );
}
