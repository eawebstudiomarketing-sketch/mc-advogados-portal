"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Search, Settings2, EyeOff } from "lucide-react";
import { baixarPlanilha } from "@/components/ui/barra-filtros";
import { desacompanharAction } from "../actions";

// Tabela "Sua carteira": busca, Por página (10/25/50/100), Exportar Excel e as
// ações Configurar / Desacompanhar de cada marca.

type Linha = { processo: string; nome: string; imagem: string | null; despacho: string | null; despachoData: string | null; situacao: string | null; cliente: string | null };
const dataBR = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export function CarteiraMarcas({ marcas }: { marcas: Linha[] }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [porPagina, setPorPagina] = useState(25);
  const [pagina, setPagina] = useState(1);
  const [pending, start] = useTransition();
  const f = busca.trim().toLowerCase();
  const filtradas = useMemo(() => (f ? marcas.filter((m) => m.nome.toLowerCase().includes(f) || m.processo.includes(f) || (m.cliente ?? "").toLowerCase().includes(f)) : marcas), [marcas, f]);
  const paginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const atual = Math.min(pagina, paginas);
  const vista = filtradas.slice((atual - 1) * porPagina, atual * porPagina);

  function desacompanhar(m: Linha) {
    if (!window.confirm(`Desacompanhar ${m.nome} (${m.processo})? Ela sai da carteira e para de receber avisos.`)) return;
    start(async () => {
      const r = await desacompanharAction(m.processo);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${m.nome} desacompanhada`);
      router.refresh();
    });
  }

  return (
    <section className="ui-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="mr-auto">
          <h2 className="section-title">Sua carteira</h2>
          <p className="text-xs text-muted">
            {marcas.length} marca(s) · <span className="font-medium text-status-success">Acompanhamento ativo</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            baixarPlanilha({
              arquivo: "marcas-acompanhadas",
              colunas: ["Processo", "Nome", "Data", "Último despacho", "Status", "Cliente"],
              linhas: filtradas.map((m) => [m.processo, m.nome, dataBR(m.despachoData), m.despacho, m.situacao, m.cliente]),
            })
          }
          className="ui-btn-secondary"
        >
          <Download className="h-4 w-4" aria-hidden /> Exportar Excel
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Buscar na carteira de marcas</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
            placeholder="Buscar marca ou processo"
            className="h-9 w-full rounded-full border border-border bg-surface pr-3 pl-9 text-[13px] placeholder:text-muted focus:border-navy-3 focus:outline-none"
          />
        </label>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          Por página
          <select
            value={porPagina}
            onChange={(e) => {
              setPorPagina(Number(e.target.value));
              setPagina(1);
            }}
            className="ui-input h-9 w-auto py-1"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="ui-table">
          <caption className="sr-only">Marcas acompanhadas, últimos despachos, situação e ações disponíveis.</caption>
          <thead>
            <tr>
              <th className="w-10 px-4 py-2.5">#</th>
              <th className="px-4 py-2.5">Marca / Processo</th>
              <th className="px-4 py-2.5">Último despacho</th>
              <th className="px-4 py-2.5">Situação</th>
              <th className="px-4 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-border ${pending ? "opacity-60" : ""}`}>
            {vista.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                  {marcas.length ? "Nenhuma marca encontrada na carteira." : "Nenhuma marca acompanhada ainda. Use “Cadastrar processo” para começar."}
                </td>
              </tr>
            )}
            {vista.map((m, i) => (
              <tr key={m.processo}>
                <td className="px-4 py-3 text-xs text-muted tabular-nums">{(atual - 1) * porPagina + i + 1}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/marcas/processos/${m.processo}`} className="group flex items-center gap-3">
                    {m.imagem ? (
                      // eslint-disable-next-line @next/next/no-img-element -- logo vindo do INPI (data URL ou Storage)
                      <img src={m.imagem} alt="" className="h-9 w-9 shrink-0 rounded-md bg-white object-contain ring-1 ring-border" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy text-sm font-bold text-gold-2">{m.nome.trim()[0]?.toUpperCase()}</span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground group-hover:underline">{m.nome}</span>
                      <span className="block text-xs text-muted">
                        Processo <span className="font-mono">{m.processo}</span>
                        {m.cliente ? ` · ${m.cliente}` : ""}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="max-w-xs px-4 py-3 text-sm">
                  <span className="text-foreground/85">{m.despacho ?? "—"}</span>
                  {m.despachoData && <span className="block text-xs text-muted">{dataBR(m.despachoData)}</span>}
                </td>
                <td className="max-w-xs px-4 py-3 text-sm text-foreground/80">{m.situacao ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Link href={`/admin/marcas/configurar?processo=${m.processo}`} className="ui-btn-secondary h-8 px-2.5 text-xs" aria-label={`Configurar ${m.nome}`}>
                      <Settings2 className="h-3.5 w-3.5" aria-hidden /> Configurar
                    </Link>
                    <button type="button" onClick={() => desacompanhar(m)} className="ui-btn-secondary h-8 px-2.5 text-xs" aria-label={`Desacompanhar ${m.nome}`}>
                      <EyeOff className="h-3.5 w-3.5" aria-hidden /> Desacompanhar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm text-muted">
          <span>
            {(atual - 1) * porPagina + 1}–{Math.min(atual * porPagina, filtradas.length)} de {filtradas.length}
          </span>
          <span className="flex items-center gap-1">
            <button type="button" disabled={atual === 1} onClick={() => setPagina(atual - 1)} className="icon-btn disabled:opacity-40" aria-label="Página anterior">
              <ChevronLeft aria-hidden />
            </button>
            <span className="tabular-nums">
              {atual} / {paginas}
            </span>
            <button type="button" disabled={atual === paginas} onClick={() => setPagina(atual + 1)} className="icon-btn disabled:opacity-40" aria-label="Próxima página">
              <ChevronRight aria-hidden />
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
