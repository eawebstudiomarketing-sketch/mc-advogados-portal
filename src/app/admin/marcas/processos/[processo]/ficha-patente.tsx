import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Marca, Prazo, Publicacao } from "@/lib/marcas/dados";
import { formatarProcesso } from "@/lib/marcas/formato";
import { BotoesFicha } from "./botoes-ficha";

// "Detalhes da patente" do Marca Acompanhada: título, resumo, procurador,
// titular, inventor, classes, depósito/publicação e as publicações na RPI.
// Na tabela marcas: nome = título, especificacao = resumo, cfe = inventor,
// status_classe = classe nacional, classe = classe internacional.

const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);
const pdfRevista = (rpi: number) => `https://revistas.inpi.gov.br/pdf/Patentes${rpi}.pdf`;

export function FichaPatente({ m, publicacoes, prazos }: { m: Marca; publicacoes: Publicacao[]; prazos: Prazo[] }) {
  const numero = formatarProcesso(m.processo);
  const publicado = publicacoes.find((p) => p.codigo === "3.1");
  const pendentes = prazos.filter((p) => p.situacao === "pendente");
  const linha = (rotulo: string, valor: React.ReactNode) =>
    valor ? (
      <p className="border-b border-border py-2.5 text-sm leading-relaxed last:border-b-0">
        {rotulo}: {valor}
      </p>
    ) : null;

  return (
    <div className="ficha-marca space-y-5 print:space-y-4">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted print:hidden" aria-label="Caminho">
        <Link href="/admin/marcas" className="text-navy-3 hover:underline">
          Principal
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <Link href="/admin/marcas/patentes" className="hover:underline">
          Patentes
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span>Detalhes da patente</span>
      </nav>
      <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Detalhes da patente</h1>

      <section className="ui-card overflow-hidden">
        <h2 className="border-b border-border px-6 py-4 text-[15px] font-semibold text-foreground">
          Detalhes sobre a patente <span className="tabular-nums">{numero}</span>
        </h2>
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_300px] print:grid-cols-[1fr_230px] print:p-4">
          <div className="min-w-0">
            {linha("Título", m.nome)}
            {linha("Resumo", m.especificacao)}
            {linha("Procurador", m.procurador ? <span className="text-navy-3">{m.procurador}</span> : null)}
            {linha("Titular", m.titular ? <span className="text-navy-3">{`${m.titular}${m.titular_uf ? ` (${m.titular_uf}/BR)` : ""}`}</span> : null)}
            {linha("Inventor", m.cfe)}
            {linha("Classe nacional", m.status_classe)}
            {linha("Classe internacional", m.classe)}
            {linha("Data de depósito", dataBR(m.deposito))}
            {linha("Data de publicação", dataBR(publicado?.data))}
            {linha("Situação", m.situacao)}
            {(m.clients?.name || m.contato_nome) && linha("Cliente", m.clients?.name ?? m.contato_nome)}
          </div>
          <div className="space-y-4">
            <div className="rounded-[10px] border border-border">
              <h3 className="border-b border-border px-5 py-3.5 text-center text-sm font-semibold text-foreground">Prazos administrativos</h3>
              <ol className="space-y-4 px-5 py-4">
                {pendentes.length === 0 && <li className="text-sm text-muted">Nenhum prazo em aberto.</li>}
                {pendentes.map((p) => (
                  <li key={p.id} className="relative pl-8">
                    <span className="absolute top-0.5 left-0 h-4 w-4 rounded-full border-[3px] border-foreground/80 bg-surface" aria-hidden />
                    <p className="text-sm text-foreground">{p.acao}</p>
                    <p className="text-sm font-semibold text-foreground">{dataBR(p.vence_em)}</p>
                    <p className="text-xs text-muted">prazo legal</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-2 print:hidden">
              <BotoesFicha processo={m.processo} nome={m.nome ?? numero} />
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
              {publicacoes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-muted">
                    Nenhuma publicação.
                  </td>
                </tr>
              )}
              {publicacoes.map((p) => (
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
    </div>
  );
}
