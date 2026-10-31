import Link from "next/link";
import { exigirPermissao } from "@/lib/dal";
import { listMarcas } from "@/lib/marcas/dados";
import { formatarProcesso } from "@/lib/marcas/formato";
import { BotaoDesacompanhar } from "./botao-desacompanhar";

// Patentes → Processos ("Patentes acompanhadas" no Marca Acompanhada): processo,
// título, último despacho com o código, situação e as ações.

const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export default async function PatentesPage() {
  await exigirPermissao("marcas");
  const patentes = await listMarcas({ tipo: "patente" });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Patentes acompanhadas</h1>
        <p className="mt-1 text-sm text-muted">Consulte os processos acompanhados e suas últimas publicações no INPI.</p>
      </div>
      <section className="ui-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Sua carteira</h2>
          <span className="rounded-md border border-border px-2 py-0.5 text-xs text-foreground">{patentes.length} processo(s)</span>
          <span className="text-xs font-medium text-status-success">Acompanhamento ativo</span>
          <a href="https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp" target="_blank" rel="noreferrer" className="ui-btn-secondary ml-auto">
            Buscar no INPI
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="px-5 py-2.5">Processo</th>
                <th className="px-5 py-2.5">Título</th>
                <th className="px-5 py-2.5">Último despacho</th>
                <th className="px-5 py-2.5">Situação</th>
                <th className="px-5 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {patentes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-sm text-muted">
                    Nenhuma patente acompanhada.
                  </td>
                </tr>
              )}
              {patentes.map((p) => (
                <tr key={p.processo} className="align-top">
                  <td className="px-5 py-3 text-sm whitespace-nowrap">
                    <Link href={`/admin/marcas/processos/${p.processo}`} className="text-navy-3 hover:underline">
                      {formatarProcesso(p.processo)}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-sm">{p.nome}</td>
                  <td className="px-5 py-3 text-sm">
                    {p.ultimo_despacho}
                    {p.ultimo_despacho_codigo && <span className="text-muted"> ({p.ultimo_despacho_codigo})</span>}
                    <span className="block text-xs text-muted">{dataBR(p.ultimo_despacho_data)}</span>
                  </td>
                  <td className="px-5 py-3 text-sm">{p.situacao}</td>
                  <td className="px-5 py-3 text-sm whitespace-nowrap">
                    <Link href={`/admin/marcas/configurar?processo=${p.processo}`} className="mr-3 text-navy-3 hover:underline">
                      Configurar
                    </Link>
                    <BotaoDesacompanhar processo={p.processo} nome={p.nome ?? formatarProcesso(p.processo)} />
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
