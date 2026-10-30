"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpDown, Check, ChevronRight, Download, ListFilter, Search, X } from "lucide-react";

// Barra de filtros padrão das listas do portal: busca em pílula + UM ícone de
// filtro. Ao clicar nele aparece a lista dos tipos de filtro; escolhendo um,
// aparecem as opções dele. O que está ligado vira uma etiqueta ao lado (com X
// para tirar). Cada filtro vira um parâmetro na URL (?status=...&busca=...): a
// tela filtra no servidor, o link pode ser compartilhado e o "voltar" do
// navegador desfaz o filtro.

export type Filtro =
  | { tipo: "busca"; nome: string; rotulo: string }
  | { tipo: "select"; nome: string; rotulo: string; opcoes: { valor: string; rotulo: string; cor?: string }[]; todos?: string }
  | { tipo: "data"; nome: string; rotulo: string };

type FiltroEscolha = Extract<Filtro, { tipo: "select" | "data" }>;

const dataBr = (v: string) => v.split("-").reverse().join("/");
/** Como o valor ligado aparece escrito ("Atrasadas", "11/10/2026"). */
const textoDoValor = (f: FiltroEscolha, v: string) => (f.tipo === "select" ? (f.opcoes.find((o) => o.valor === v)?.rotulo ?? v) : dataBr(v));

function Opcoes({ filtro, valor, aoEscolher }: { filtro: FiltroEscolha; valor: string; aoEscolher: (v: string) => void }) {
  const [termo, setTermo] = useState("");
  if (filtro.tipo === "data") {
    return (
      <div className="p-3">
        <input type="date" value={valor} onChange={(e) => aoEscolher(e.target.value)} className="ui-input" autoFocus />
      </div>
    );
  }
  const opcoes = termo.trim() ? filtro.opcoes.filter((o) => o.rotulo.toLowerCase().includes(termo.trim().toLowerCase())) : filtro.opcoes;
  return (
    <>
      {filtro.opcoes.length > 8 && (
        <div className="border-b border-border p-2">
          <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Procurar…" className="ui-input py-1.5 text-sm" autoFocus />
        </div>
      )}
      <ul role="listbox" className="max-h-72 overflow-y-auto p-1.5">
        <li>
          <button
            type="button"
            role="option"
            aria-selected={!valor}
            onClick={() => aoEscolher("")}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <span className="w-4">{!valor && <Check className="h-4 w-4 text-navy" aria-hidden />}</span>
            {filtro.todos ?? "Todos"}
          </button>
        </li>
        {opcoes.map((o) => (
          <li key={o.valor}>
            <button
              type="button"
              role="option"
              aria-selected={valor === o.valor}
              onClick={() => aoEscolher(o.valor)}
              className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-surface-2 ${
                valor === o.valor ? "font-semibold text-foreground" : "text-foreground/80"
              }`}
            >
              <span className="w-4">{valor === o.valor && <Check className="h-4 w-4 text-navy" aria-hidden />}</span>
              {o.cor && <span className={`h-2 w-2 shrink-0 rounded-full ${o.cor}`} aria-hidden />}
              <span className="truncate">{o.rotulo}</span>
            </button>
          </li>
        ))}
        {opcoes.length === 0 && <li className="px-3 py-2 text-xs text-muted">Nada encontrado.</li>}
      </ul>
    </>
  );
}

function MenuFiltros({
  filtros,
  valorDe,
  aoMudar,
  ativos,
}: {
  filtros: FiltroEscolha[];
  valorDe: (nome: string) => string;
  aoMudar: (nome: string, v: string) => void;
  ativos: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<string | null>(null); // nome do filtro aberto; null = lista dos tipos
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const atual = filtros.find((f) => f.nome === etapa) ?? null;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => {
          setEtapa(null);
          setAberto((a) => !a);
        }}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={ativos ? `Filtros (${ativos} ligados)` : "Filtros"}
        data-tip="Filtros"
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
          ativos ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/80 hover:border-border-strong hover:text-foreground"
        }`}
      >
        <ListFilter className="h-4 w-4" aria-hidden />
        {ativos > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy tabular-nums">{ativos}</span>
        )}
      </button>

      {aberto && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-72 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_40px_-12px_rgba(15,26,42,0.25)] animate-[enter_160ms_var(--ease-out)_both]">
          {atual ? (
            <>
              <button
                type="button"
                onClick={() => setEtapa(null)}
                className="eyebrow flex w-full items-center gap-2 border-b border-border px-3.5 py-2 text-left hover:bg-surface-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {atual.rotulo}
              </button>
              <Opcoes
                filtro={atual}
                valor={valorDe(atual.nome)}
                aoEscolher={(v) => {
                  aoMudar(atual.nome, v);
                  setAberto(false);
                }}
              />
            </>
          ) : (
            <>
              <p className="eyebrow border-b border-border px-3.5 py-2">Filtrar por</p>
              <ul role="menu" className="max-h-80 overflow-y-auto p-1.5">
                {filtros.map((f) => {
                  const v = valorDe(f.nome);
                  return (
                    <li key={f.nome}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setEtapa(f.nome)}
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-foreground/90 hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 truncate">{f.rotulo}</span>
                        {v && <span className="max-w-[110px] truncate rounded-full bg-navy px-2 py-0.5 text-[11px] font-medium text-white">{textoDoValor(f, v)}</span>}
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Ordem da lista: cada opção vira ?ordem=valor (a primeira é a padrão). */
export type Ordenacao = { opcoes: { valor: string; rotulo: string }[] };
/** O que vai para a planilha: os títulos das colunas e as linhas já em texto. */
export type Exportacao = { arquivo: string; colunas: string[]; linhas: (string | number | null | undefined)[][] };

/** Fecha o menu ao clicar fora ou apertar Esc. */
function useFecharFora(aberto: boolean, fechar: () => void) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) fechar();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto, fechar]);
  return caixa;
}

const BOTAO_ICONE = "relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors";
const BOTAO_NEUTRO = "border-border bg-surface text-foreground/80 hover:border-border-strong hover:text-foreground";
const CAIXA_MENU =
  "absolute top-[calc(100%+6px)] left-0 z-50 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_40px_-12px_rgba(15,26,42,0.25)] animate-[enter_160ms_var(--ease-out)_both]";

function MenuOrdem({ ordenacao, valor, aoMudar }: { ordenacao: Ordenacao; valor: string; aoMudar: (v: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useFecharFora(aberto, () => setAberto(false));
  const atual = ordenacao.opcoes.find((o) => o.valor === valor) ?? ordenacao.opcoes[0];
  const mudou = !!valor && valor !== ordenacao.opcoes[0]?.valor;
  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Ordenar (agora: ${atual?.rotulo})`}
        data-tip="Ordenar"
        className={`${BOTAO_ICONE} ${mudou ? "border-navy bg-navy text-white" : BOTAO_NEUTRO}`}
      >
        <ArrowUpDown className="h-4 w-4" aria-hidden />
      </button>
      {aberto && (
        <div className={CAIXA_MENU}>
          <p className="eyebrow border-b border-border px-3.5 py-2">Ordenar por</p>
          <ul role="menu" className="p-1.5">
            {ordenacao.opcoes.map((o, i) => {
              const on = o.valor === atual?.valor;
              return (
                <li key={o.valor}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => {
                      aoMudar(i === 0 ? "" : o.valor);
                      setAberto(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-surface-2 ${on ? "font-semibold text-foreground" : "text-foreground/80"}`}
                  >
                    <span className="w-4">{on && <Check className="h-4 w-4 text-navy" aria-hidden />}</span>
                    {o.rotulo}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Planilha CSV que o Excel abre direto (ponto e vírgula, acentos certos). */
function baixarPlanilha({ arquivo, colunas, linhas }: Exportacao) {
  const celula = (v: string | number | null | undefined) => {
    const t = v == null ? "" : String(v);
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = [colunas, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${arquivo}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BarraFiltros({ filtros, extra, ordenacao, exportar }: { filtros: Filtro[]; extra?: React.ReactNode; ordenacao?: Ordenacao; exportar?: Exportacao }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const busca = filtros.find((f) => f.tipo === "busca");
  const escolhas = filtros.filter((f): f is FiltroEscolha => f.tipo !== "busca");
  const [texto, setTexto] = useState(busca ? (params.get(busca.nome) ?? "") : "");
  const primeira = useRef(true);

  function aplicar(nome: string, valor: string) {
    const q = new URLSearchParams(params.toString());
    if (valor) q.set(nome, valor);
    else q.delete(nome);
    q.delete("pagina");
    q.delete("page");
    start(() => router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false }));
  }

  // busca por texto: espera a pessoa parar de digitar
  useEffect(() => {
    if (!busca) return;
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const t = setTimeout(() => aplicar(busca.nome, texto.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage ao texto
  }, [texto]);

  const ligados = escolhas.filter((f) => params.get(f.nome));
  const ativos = filtros.filter((f) => params.get(f.nome)).length;
  const limpar = () => {
    const q = new URLSearchParams(params.toString());
    filtros.forEach((f) => q.delete(f.nome));
    setTexto("");
    start(() => router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false }));
  };

  return (
    <div className={`mb-5 flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-70" : ""}`} role="search">
      {busca && (
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={busca.rotulo}
            aria-label={busca.rotulo}
            className="h-9 w-full rounded-full border border-border bg-surface pr-3 pl-10 text-[13px] text-foreground transition-colors placeholder:text-muted hover:border-border-strong focus:border-navy-3 focus:outline-none"
          />
        </div>
      )}
      {escolhas.length > 0 && <MenuFiltros filtros={escolhas} valorDe={(n) => params.get(n) ?? ""} aoMudar={aplicar} ativos={ligados.length} />}
      {ordenacao && ordenacao.opcoes.length > 1 && <MenuOrdem ordenacao={ordenacao} valor={params.get("ordem") ?? ""} aoMudar={(v) => aplicar("ordem", v)} />}
      {exportar && (
        <button
          type="button"
          onClick={() => baixarPlanilha(exportar)}
          disabled={!exportar.linhas.length}
          aria-label={`Exportar ${exportar.linhas.length} linha(s) para Excel`}
          data-tip="Exportar para Excel"
          className={`${BOTAO_ICONE} ${BOTAO_NEUTRO} disabled:opacity-40`}
        >
          <Download className="h-4 w-4" aria-hidden />
        </button>
      )}
      {ligados.map((f) => (
        <span key={f.nome} className="inline-flex h-9 max-w-[260px] items-center gap-1.5 rounded-full border border-navy bg-navy pr-1.5 pl-3.5 text-[13px] font-medium text-white">
          <span className="truncate">
            <span className="opacity-70">{f.rotulo}: </span>
            {textoDoValor(f, params.get(f.nome)!)}
          </span>
          <button type="button" onClick={() => aplicar(f.nome, "")} aria-label={`Tirar filtro ${f.rotulo}`} className="rounded-full p-1 hover:bg-white/15">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ))}
      {extra}
      {ativos > 0 && (
        <button type="button" onClick={limpar} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-foreground">
          <X className="h-3.5 w-3.5" aria-hidden /> Limpar
        </button>
      )}
    </div>
  );
}
