"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Search, X } from "lucide-react";

// Barra de filtros padrão das listas do portal: busca em pílula + botões de
// filtro que abrem um menu. Cada filtro vira um parâmetro na URL
// (?status=...&busca=...): a tela filtra no servidor, o link pode ser
// compartilhado e o "voltar" do navegador desfaz o filtro.

export type Filtro =
  | { tipo: "busca"; nome: string; rotulo: string }
  | { tipo: "select"; nome: string; rotulo: string; opcoes: { valor: string; rotulo: string; cor?: string }[]; todos?: string }
  | { tipo: "data"; nome: string; rotulo: string };

function Pilula({
  filtro,
  valor,
  aoMudar,
}: {
  filtro: Extract<Filtro, { tipo: "select" | "data" }>;
  valor: string;
  aoMudar: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
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

  const escolhida = filtro.tipo === "select" ? filtro.opcoes.find((o) => o.valor === valor) : null;
  const texto = filtro.tipo === "select" ? (escolhida?.rotulo ?? filtro.rotulo) : valor ? `${filtro.rotulo} ${valor.split("-").reverse().join("/")}` : filtro.rotulo;
  const opcoes =
    filtro.tipo === "select" && termo.trim()
      ? filtro.opcoes.filter((o) => o.rotulo.toLowerCase().includes(termo.trim().toLowerCase()))
      : filtro.tipo === "select"
        ? filtro.opcoes
        : [];

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className={`inline-flex h-9 max-w-[240px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
          valor ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/80 hover:border-border-strong hover:text-foreground"
        }`}
      >
        {escolhida?.cor && <span className={`h-2 w-2 shrink-0 rounded-full ${escolhida.cor}`} aria-hidden />}
        <span className="truncate">{texto}</span>
        {valor ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Tirar filtro ${filtro.rotulo}`}
            onClick={(e) => {
              e.stopPropagation();
              aoMudar("");
              setAberto(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                aoMudar("");
              }
            }}
            className="-mr-1 rounded-full p-0.5 hover:bg-white/15"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        )}
      </button>

      {aberto && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_40px_-12px_rgba(15,26,42,0.25)] animate-[enter_160ms_var(--ease-out)_both]">
          <p className="eyebrow border-b border-border px-3.5 py-2">{filtro.rotulo}</p>
          {filtro.tipo === "data" ? (
            <div className="p-3">
              <input
                type="date"
                value={valor}
                onChange={(e) => {
                  aoMudar(e.target.value);
                  setAberto(false);
                }}
                className="ui-input"
                autoFocus
              />
            </div>
          ) : (
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
                    onClick={() => {
                      aoMudar("");
                      setAberto(false);
                    }}
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
                      onClick={() => {
                        aoMudar(o.valor);
                        setAberto(false);
                      }}
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
          )}
        </div>
      )}
    </div>
  );
}

export function BarraFiltros({ filtros, extra }: { filtros: Filtro[]; extra?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const busca = filtros.find((f) => f.tipo === "busca");
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
      {filtros.map((f) =>
        f.tipo === "busca" ? null : <Pilula key={f.nome} filtro={f} valor={params.get(f.nome) ?? ""} aoMudar={(v) => aplicar(f.nome, v)} />
      )}
      {extra}
      {ativos > 0 && (
        <button type="button" onClick={limpar} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-foreground">
          <X className="h-3.5 w-3.5" aria-hidden /> Limpar
        </button>
      )}
    </div>
  );
}
