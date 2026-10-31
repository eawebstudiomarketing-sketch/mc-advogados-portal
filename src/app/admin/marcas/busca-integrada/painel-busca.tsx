"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { baixarPlanilha } from "@/components/ui/barra-filtros";
import { buscaIntegradaAction, type ResultadoIntegrada } from "../busca-actions";

// Busca Integrada de Marcas INPI (como no Marca Acompanhada): modo de busca,
// resultados e o Carrinho de Marcas Selecionadas (fica neste navegador e entra
// no parecer da Busca com IA).

const MODOS = [
  { id: "nome", rotulo: "Nome de marca" },
  { id: "titular", rotulo: "Titular" },
  { id: "procurador", rotulo: "Procurador" },
  { id: "processo", rotulo: "Nº Processo" },
] as const;
type Modo = (typeof MODOS)[number]["id"];
export type ItemCarrinho = { processo: string; marca: string; classes: string; situacao: string; titular: string; relevancia: number };
export const CHAVE_CARRINHO = "mc:marcas-carrinho";

export function lerCarrinho(): ItemCarrinho[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CARRINHO) ?? "[]");
  } catch {
    return [];
  }
}

export function PainelBuscaIntegrada() {
  const [modo, setModo] = useState<Modo>("nome");
  const [termo, setTermo] = useState("");
  const [tipo, setTipo] = useState<"exata" | "radical" | "fonetica">("radical");
  const [classe, setClasse] = useState("");
  const [resultados, setResultados] = useState<ResultadoIntegrada[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selRes, setSelRes] = useState<Set<string>>(new Set());
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [selCar, setSelCar] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  // o carrinho mora no navegador: lido depois de montar (no servidor não existe)
  useEffect(() => {
    const t = setTimeout(() => setCarrinho(lerCarrinho()));
    return () => clearTimeout(t);
  }, []);
  const salvarCarrinho = (c: ItemCarrinho[]) => {
    setCarrinho(c);
    try {
      localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(c));
    } catch {}
  };

  function pesquisar() {
    start(async () => {
      const r = await buscaIntegradaAction({ modo, termo, tipo, classe });
      if (!r.ok) return void toast.error(r.error);
      setResultados(r.resultados);
      setTotal(r.total);
      setSelRes(new Set());
      try {
        sessionStorage.setItem("mc:marcas-ultima-busca", JSON.stringify({ modo, termo, tipo, classe, resultados: r.resultados, total: r.total }));
      } catch {}
    });
  }

  function recuperar() {
    try {
      const u = JSON.parse(sessionStorage.getItem("mc:marcas-ultima-busca") ?? "null");
      if (!u) return void toast.message("Nenhuma busca anterior nesta aba.");
      setModo(u.modo);
      setTermo(u.termo);
      setTipo(u.tipo);
      setClasse(u.classe);
      setResultados(u.resultados);
      setTotal(u.total);
    } catch {}
  }

  function adicionar() {
    const novos = (resultados ?? []).filter((r) => selRes.has(r.processo) && !carrinho.some((c) => c.processo === r.processo));
    salvarCarrinho([...carrinho, ...novos.map((r) => ({ processo: r.processo, marca: r.marca, classes: r.classes, situacao: r.situacao, titular: r.titular, relevancia: r.relevancia }))]);
    setSelRes(new Set());
    toast.success(`${novos.length} marca(s) no carrinho`);
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiado");
    } catch {
      window.prompt("Copie o conteúdo:", texto);
    }
  }
  const paraIA = () =>
    `Marcas selecionadas no INPI para análise de colidência:\n${carrinho.map((c) => `- ${c.marca} (processo ${c.processo}, classe ${c.classes}, ${c.situacao}, titular ${c.titular}${c.relevancia ? `, relevância ${c.relevancia}%` : ""})`).join("\n")}`;

  const selCls = "h-9 rounded border border-border bg-surface px-2 text-sm";
  return (
    <div className="space-y-5">
      <section className="ui-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Modo de busca</h2>
        <nav className="mt-3 flex flex-wrap gap-5 border-b border-border" aria-label="Modo de busca">
          {MODOS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModo(m.id)}
              className={`-mb-px border-b-2 px-1 pb-2.5 text-sm ${modo === m.id ? "border-navy-3 font-medium text-foreground" : "border-transparent text-foreground/65 hover:text-foreground"}`}
            >
              {m.rotulo}
            </button>
          ))}
        </nav>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            pesquisar();
          }}
        >
          <label className="text-sm font-medium text-foreground">
            {modo === "nome" ? "Termos de busca:" : modo === "titular" ? "Nome do titular:" : modo === "procurador" ? "Nome do procurador:" : "Número do processo:"}
            <input value={termo} onChange={(e) => setTermo(e.target.value)} className="mt-1 block h-9 w-full rounded border border-border bg-surface px-2.5 text-sm font-normal" />
          </label>
          {modo === "nome" && (
            <div className="flex flex-wrap items-end gap-4 sm:col-span-2">
              <fieldset className="text-sm">
                <legend className="mb-1 font-medium text-foreground">Tipo de busca:</legend>
                {(["exata", "radical", "fonetica"] as const).map((t) => (
                  <label key={t} className="mr-4 inline-flex items-center gap-1.5">
                    <input type="radio" name="tipo" checked={tipo === t} onChange={() => setTipo(t)} />
                    {t === "exata" ? "Exata" : t === "radical" ? "Radical" : "Fonética"}
                  </label>
                ))}
              </fieldset>
              <label className="text-sm font-medium text-foreground">
                Classe (NCL):
                <input value={classe} onChange={(e) => setClasse(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Todas" className={`${selCls} mt-1 block w-24 font-normal`} />
              </label>
            </div>
          )}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" disabled={pending} className="ui-btn">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />} Pesquisar
            </button>
            <button type="button" onClick={recuperar} className="ui-btn-secondary">
              Recuperar última busca
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted">A busca vai direto no INPI. A Fonética procura também as grafias que soam igual (K/C, S/Z, PH/F, Y/I…).</p>
      </section>

      <section className="ui-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Resultados da Busca</h2>
          {resultados && <span className="text-sm text-muted">{resultados.length} de {total} processo(s)</span>}
          {selRes.size > 0 && (
            <button type="button" onClick={adicionar} className="ui-btn ml-auto">
              Adicionar {selRes.size} ao carrinho
            </button>
          )}
        </div>
        {!resultados ? (
          <p className="px-5 py-8 text-center text-sm text-muted">Faça uma pesquisa para ver os resultados aqui</p>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="w-8 px-3 py-2.5" />
                  {modo === "nome" && <th className="px-3 py-2.5">Rel.</th>}
                  <th className="px-3 py-2.5">Processo</th>
                  <th className="px-3 py-2.5">Marca</th>
                  <th className="px-3 py-2.5">NCL</th>
                  <th className="px-3 py-2.5">Situação</th>
                  <th className="px-3 py-2.5">Titular</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resultados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted">
                      Nada encontrado no INPI.
                    </td>
                  </tr>
                )}
                {resultados.map((r) => (
                  <tr key={r.processo}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${r.marca}`}
                        checked={selRes.has(r.processo)}
                        onChange={(e) => setSelRes((s) => (e.target.checked ? new Set(s).add(r.processo) : new Set([...s].filter((x) => x !== r.processo))))}
                      />
                    </td>
                    {modo === "nome" && <td className="px-3 py-2 text-sm tabular-nums">{r.relevancia}%</td>}
                    <td className="px-3 py-2 text-sm tabular-nums">
                      {r.jaRegistrado ? (
                        <Link href={`/admin/marcas/processos/${r.processo}`} className="text-navy-3 hover:underline">
                          {r.processo}
                        </Link>
                      ) : (
                        r.processo
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm font-medium">{r.marca}</td>
                    <td className="px-3 py-2 text-sm">{r.classes}</td>
                    <td className="px-3 py-2 text-sm">{r.situacao}</td>
                    <td className="px-3 py-2 text-sm">{r.titular}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ui-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Carrinho de Marcas Selecionadas</h2>
          <span className="contador-ma rounded px-2 py-0.5 text-xs font-semibold">{carrinho.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="w-8 px-3 py-2.5" />
                <th className="px-3 py-2.5">Rel.</th>
                <th className="px-3 py-2.5">Marca</th>
                <th className="px-3 py-2.5">NCL</th>
                <th className="px-3 py-2.5">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {carrinho.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted">
                    Seu carrinho está vazio. Adicione marcas dos resultados da busca.
                  </td>
                </tr>
              )}
              {carrinho.map((c) => (
                <tr key={c.processo}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${c.marca} no carrinho`}
                      checked={selCar.has(c.processo)}
                      onChange={(e) => setSelCar((s) => (e.target.checked ? new Set(s).add(c.processo) : new Set([...s].filter((x) => x !== c.processo))))}
                    />
                  </td>
                  <td className="px-3 py-2 text-sm tabular-nums">{c.relevancia ? `${c.relevancia}%` : "—"}</td>
                  <td className="px-3 py-2 text-sm font-medium">
                    {c.marca} <span className="text-xs text-muted">({c.processo})</span>
                  </td>
                  <td className="px-3 py-2 text-sm">{c.classes}</td>
                  <td className="px-3 py-2 text-sm">{c.situacao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
          <button type="button" className="ui-btn-secondary" disabled={!carrinho.length} onClick={() => window.confirm("Limpar o carrinho?") && salvarCarrinho([])}>
            Limpar carrinho
          </button>
          <button type="button" className="ui-btn-secondary" disabled={!selCar.size} onClick={() => (salvarCarrinho(carrinho.filter((c) => !selCar.has(c.processo))), setSelCar(new Set()))}>
            Remover selecionados
          </button>
          <button type="button" className="ui-btn-secondary" disabled={!carrinho.length} onClick={() => copiar(paraIA())}>
            Copiar para IA
          </button>
          <button type="button" className="ui-btn-secondary" disabled={!carrinho.length} onClick={() => copiar(JSON.stringify(carrinho, null, 2))}>
            Copiar JSON
          </button>
          <button
            type="button"
            className="ui-btn"
            disabled={!carrinho.length}
            onClick={() =>
              baixarPlanilha({
                arquivo: "relatorio-busca-integrada",
                colunas: ["Relevância", "Processo", "Marca", "NCL", "Situação", "Titular"],
                linhas: carrinho.map((c) => [c.relevancia ? `${c.relevancia}%` : "", c.processo, c.marca, c.classes, c.situacao, c.titular]),
              })
            }
          >
            Download Relatório
          </button>
        </div>
      </section>
    </div>
  );
}
