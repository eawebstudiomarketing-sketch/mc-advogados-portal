"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Database, Loader2, Plus, Search, Settings2 } from "lucide-react";
import { acompanharAction, buscarCadastroAction, type DadosManuais, type ResultadoCadastro } from "../actions";
import type { FonteBusca } from "@/lib/marcas/inpi";

// "Encontrar processos" do Cadastrar processos, nas mesmas abas do Marca
// Acompanhada; a busca vai direto no INPI (pePI) pela ponte da VPS.

const ABAS = [
  { id: "processo", rotulo: "Nº de processo", ph: "Ex: 912345678" },
  { id: "nome", rotulo: "Nome exato", ph: "Ex: NIKE" },
  { id: "titular", rotulo: "Titular", ph: "Nome completo do titular" },
  { id: "procurador", rotulo: "Procurador", ph: "Nome do procurador/escritório" },
] as const;
type Aba = (typeof ABAS)[number]["id"];
type Coluna = "processo" | "marca" | "titular" | "classes" | "situacao";
const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Cabeçalho que ordena a tabela ao clicar (de novo: inverte). */
function Th({ col, ordem, setOrdem, children }: { col: Coluna; ordem: { col: Coluna; asc: boolean } | null; setOrdem: (o: { col: Coluna; asc: boolean }) => void; children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5">
      <button type="button" onClick={() => setOrdem({ col, asc: ordem?.col === col ? !ordem.asc : true })} className="inline-flex items-center gap-1 font-medium hover:text-foreground">
        {children}
        {ordem?.col === col && (ordem.asc ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
      </button>
    </th>
  );
}

export function BuscaCadastro({ clientes }: { clientes: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("processo");
  const [termos, setTermos] = useState<Record<Aba, string>>({ processo: "", nome: "", titular: "", procurador: "" });
  const [resultados, setResultados] = useState<ResultadoCadastro[] | null>(null);
  const [info, setInfo] = useState("");
  const [filtro, setFiltro] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<{ col: Coluna; asc: boolean } | null>(null);
  const [manual, setManual] = useState("");
  const [dados, setDados] = useState<DadosManuais>({});
  const [fonte, setFonte] = useState<FonteBusca | null>(null);
  const [buscando, startBusca] = useTransition();
  const [salvando, startSalvar] = useTransition();
  // vindo da prévia de um processo fora da carteira: já busca pelo número
  const params = useSearchParams();
  const jaBuscou = useRef(false);

  function buscar(tipo: Aba = aba, termo = termos[tipo]) {
    if (!termo.trim()) return void toast.error("Digite um termo de busca");
    setSel(new Set());
    startBusca(async () => {
      const r = await buscarCadastroAction(tipo, termo);
      if (!r.ok) {
        setResultados([]);
        return void toast.error(r.error);
      }
      setResultados(r.resultados);
      setFonte(r.fonte);
      setInfo(`${r.total || r.resultados.length} resultado(s) encontrado(s)${r.total > r.resultados.length ? ` (mostrando os primeiros ${r.resultados.length}). Refine o filtro para resultados mais específicos.` : ""}`);
      if (tipo === "processo" && !r.resultados.length) setManual(termo.replace(/\D/g, ""));
    });
  }

  useEffect(() => {
    const n = (params.get("processo") ?? "").replace(/\D/g, "");
    if (!n || jaBuscou.current) return;
    jaBuscou.current = true;
    setTermos((t) => ({ ...t, processo: n }));
    buscar("processo", n);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir
  }, [params]);

  const vistos = useMemo(() => {
    const f = sem(filtro);
    let l = (resultados ?? []).filter((r) => !f || sem([r.processo, r.marca, r.titular, r.classes, r.situacao].join(" ")).includes(f));
    if (ordem) l = [...l].sort((a, b) => (ordem.asc ? 1 : -1) * String(a[ordem.col]).localeCompare(String(b[ordem.col]), "pt-BR", { numeric: true }));
    return l;
  }, [resultados, filtro, ordem]);

  function acompanhar(processos: string[], extra?: DadosManuais) {
    if (!processos.length) return void toast.error("Nada para acompanhar");
    startSalvar(async () => {
      // de 10 em 10 (o servidor espera 8 s entre um e outro para o INPI não bloquear)
      let feitos = 0;
      const erros: string[] = [];
      const avisos: string[] = [];
      for (let i = 0; i < processos.length; i += 10) {
        if (processos.length > 10) toast.message(`Lendo no INPI ${i + 1}–${Math.min(i + 10, processos.length)} de ${processos.length}…`);
        const r = await acompanharAction(processos.slice(i, i + 10), extra);
        if (!r.ok) return void toast.error(r.error);
        feitos += r.feitos;
        erros.push(...r.erros);
        avisos.push(...r.avisos);
      }
      toast.success(`${feitos} processo(s) na carteira${erros.length ? ` · ${erros.length} com erro` : ""}`);
      if (erros.length) toast.error(erros.slice(0, 3).join(" · "));
      if (avisos.length) toast.message(avisos.slice(0, 3).join(" · "), { duration: 12_000 });
      setResultados((rs) => rs?.map((x) => (processos.includes(x.processo) ? { ...x, jaRegistrado: true } : x)) ?? null);
      setSel(new Set());
      router.refresh();
    });
  }

  const livres = vistos.filter((r) => !r.jaRegistrado);

  return (
    <div className="space-y-5">
      <section className="ui-card p-5">
        <h2 className="section-title mb-3">Encontrar processos</h2>
        <nav className="mb-4 flex flex-wrap gap-5 border-b border-border" aria-label="Tipo de busca">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              aria-current={aba === a.id ? "page" : undefined}
              className={`-mb-px border-b-2 px-1 pb-2.5 text-[15px] transition-colors ${aba === a.id ? "border-navy-3 font-medium text-foreground" : "border-transparent text-foreground/65 hover:text-foreground"}`}
            >
              {a.rotulo}
            </button>
          ))}
        </nav>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            buscar();
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={termos[aba]}
            onChange={(e) => setTermos((t) => ({ ...t, [aba]: e.target.value }))}
            placeholder={ABAS.find((a) => a.id === aba)!.ph}
            aria-label={ABAS.find((a) => a.id === aba)!.rotulo}
            className="ui-input min-w-0 flex-1"
            inputMode={aba === "processo" ? "numeric" : undefined}
          />
          <button type="submit" disabled={buscando} className="ui-btn">
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />} Pesquisar
          </button>
        </form>
        {aba === "procurador" && <p className="mt-2 text-xs text-muted">Procura nas marcas que o portal já acompanha ou encontrou na revista com esse procurador.</p>}
      </section>

      {buscando && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Consultando o INPI…
        </p>
      )}

      {resultados && !buscando && (
        <section className="ui-card overflow-hidden">
          {fonte?.fonte === "base" && (
            <p className="flex items-start gap-2 border-b border-border bg-status-info-bg px-4 py-3 text-sm text-status-info">
              <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {aba === "procurador"
                  ? "Resultados da base própria do portal (todas as revistas do INPI desde 2017"
                  : "O INPI não respondeu agora. Estes resultados são da base própria do portal (todas as revistas do INPI desde 2017"}
                {fonte.revista ? `, até a RPI ${fonte.revista}${fonte.data ? ` de ${fonte.data.split("-").reverse().join("/")}` : ""}` : ""}). A situação vem do último despacho publicado; ao acompanhar, a ficha completa entra na conferência.
              </span>
            </p>
          )}
          {resultados.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">Nenhum processo encontrado.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <p className="mr-auto text-sm text-muted">{info}</p>
                <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar resultados: processo, marca, titular, classe, situação" className="ui-input h-9 w-full py-1 text-sm sm:w-96" aria-label="Filtrar resultados" />
                {filtro && (
                  <button type="button" onClick={() => setFiltro("")} className="ui-btn-secondary h-9">
                    Limpar filtro
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="text-sm text-muted">{sel.size} selecionado(s)</span>
                <button type="button" disabled={salvando || !livres.length} onClick={() => acompanhar(livres.map((r) => r.processo))} className="ui-btn-secondary h-9">
                  Acompanhar filtrados ({livres.length})
                </button>
                <button type="button" disabled={salvando || !sel.size} onClick={() => acompanhar([...sel])} className="ui-btn h-9">
                  {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Acompanhar Selecionados
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th className="w-10 px-4 py-2.5">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todos"
                          checked={livres.length > 0 && livres.every((r) => sel.has(r.processo))}
                          onChange={(e) => setSel(e.target.checked ? new Set(livres.map((r) => r.processo)) : new Set())}
                          className="h-4 w-4 accent-[var(--navy)]"
                        />
                      </th>
                      <Th col="processo" ordem={ordem} setOrdem={setOrdem}>Processo</Th>
                      <Th col="marca" ordem={ordem} setOrdem={setOrdem}>Marca</Th>
                      <Th col="titular" ordem={ordem} setOrdem={setOrdem}>Titular</Th>
                      <Th col="classes" ordem={ordem} setOrdem={setOrdem}>Classes</Th>
                      <Th col="situacao" ordem={ordem} setOrdem={setOrdem}>Situação</Th>
                      <th className="px-4 py-2.5">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {vistos.map((r) => (
                      <tr key={r.processo}>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            disabled={r.jaRegistrado}
                            checked={sel.has(r.processo)}
                            onChange={(e) =>
                              setSel((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(r.processo);
                                else n.delete(r.processo);
                                return n;
                              })
                            }
                            aria-label={`Selecionar ${r.processo}`}
                            className="h-4 w-4 accent-[var(--navy)]"
                          />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-sm">
                          <Link href={`/admin/marcas/processos/${r.processo}`} target="_blank" className="text-navy-3 hover:underline">
                            {r.processo}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-sm font-medium">{r.marca}</td>
                        <td className="px-4 py-2.5 text-sm">
                          <button
                            type="button"
                            onClick={() => {
                              setAba("titular");
                              setTermos((t) => ({ ...t, titular: r.titular }));
                              buscar("titular", r.titular);
                            }}
                            className="text-left text-status-info hover:underline"
                          >
                            {r.titular}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{r.classes}</td>
                        <td className="px-4 py-2.5 text-xs text-foreground/80">{r.situacao}</td>
                        <td className="px-4 py-2.5">
                          {r.jaRegistrado ? (
                            <Link href={`/admin/marcas/configurar?processo=${r.processo}`} className="ui-btn-secondary h-8 px-2.5 text-xs">
                              <Settings2 className="h-3.5 w-3.5" aria-hidden /> Configurar
                            </Link>
                          ) : (
                            <button type="button" disabled={salvando} onClick={() => acompanhar([r.processo])} className="ui-btn h-8 px-2.5 text-xs">
                              <Plus className="h-3.5 w-3.5" aria-hidden /> Acompanhar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      <section className="ui-card p-5">
        <h2 className="section-title">Cadastrar manualmente (inclusive processo ainda não publicado)</h2>
        <p className="mt-1 text-sm text-muted">
          Informe o número (9 dígitos). O portal busca a ficha no INPI; se o pedido ainda não foi publicado, ele entra na carteira como <strong>Aguardando publicação</strong> com os dados abaixo e a ficha completa entra sozinha quando sair na revista (você recebe aviso).
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = manual.replace(/\D/g, "");
            if (n.length !== 9) return void toast.error("O número do processo tem 9 dígitos");
            acompanhar([n], dados);
          }}
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <label className="space-y-1.5">
            <span className="ui-label">Número do processo *</span>
            <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Ex: 945512600" inputMode="numeric" className="ui-input" />
          </label>
          <label className="space-y-1.5">
            <span className="ui-label">Nome da marca (se ainda não publicado)</span>
            <input value={dados.nome ?? ""} onChange={(e) => setDados({ ...dados, nome: e.target.value })} className="ui-input" />
          </label>
          <label className="space-y-1.5">
            <span className="ui-label">Classe NCL</span>
            <input value={dados.classe ?? ""} onChange={(e) => setDados({ ...dados, classe: e.target.value })} inputMode="numeric" placeholder="Ex: 35" className="ui-input" />
          </label>
          <label className="space-y-1.5">
            <span className="ui-label">Titular</span>
            <input value={dados.titular ?? ""} onChange={(e) => setDados({ ...dados, titular: e.target.value })} className="ui-input" />
          </label>
          <label className="space-y-1.5">
            <span className="ui-label">Cliente</span>
            <select value={dados.client_id ?? ""} onChange={(e) => setDados({ ...dados, client_id: e.target.value || null })} className="ui-input">
              <option value="">Sem cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="ui-label">Observação</span>
            <input value={dados.observacao ?? ""} onChange={(e) => setDados({ ...dados, observacao: e.target.value })} placeholder="Ex: protocolado em 07/11" className="ui-input" />
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" disabled={salvando} className="ui-btn">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Cadastrar e acompanhar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
