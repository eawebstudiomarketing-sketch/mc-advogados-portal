"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

// Barra de filtros padrão das listas do portal. Cada filtro vira um parâmetro
// na URL (?status=...&busca=...), então a tela filtra no servidor, o link pode
// ser compartilhado e o "voltar" do navegador desfaz o filtro.

export type Filtro =
  | { tipo: "busca"; nome: string; rotulo: string }
  | { tipo: "select"; nome: string; rotulo: string; opcoes: { valor: string; rotulo: string }[]; todos?: string }
  | { tipo: "data"; nome: string; rotulo: string };

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
    <div className={`mb-4 flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-70" : ""}`} role="search">
      {busca && (
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={busca.rotulo}
            aria-label={busca.rotulo}
            className="ui-input py-1.5 pl-8 text-sm"
          />
        </div>
      )}
      {filtros.map((f) =>
        f.tipo === "select" ? (
          <select
            key={f.nome}
            value={params.get(f.nome) ?? ""}
            onChange={(e) => aplicar(f.nome, e.target.value)}
            aria-label={f.rotulo}
            className={`ui-input w-auto py-1.5 text-sm ${params.get(f.nome) ? "border-navy-3" : ""}`}
          >
            <option value="">{f.todos ?? f.rotulo}</option>
            {f.opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        ) : f.tipo === "data" ? (
          <label key={f.nome} className="flex items-center gap-1.5 text-xs text-muted">
            {f.rotulo}
            <input type="date" value={params.get(f.nome) ?? ""} onChange={(e) => aplicar(f.nome, e.target.value)} className="ui-input w-auto py-1.5 text-sm" />
          </label>
        ) : null
      )}
      {extra}
      {ativos > 0 && (
        <button type="button" onClick={limpar} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-foreground">
          <X className="h-3.5 w-3.5" aria-hidden /> Limpar filtros
        </button>
      )}
    </div>
  );
}
