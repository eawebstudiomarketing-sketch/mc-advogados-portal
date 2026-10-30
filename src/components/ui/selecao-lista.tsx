"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2, UserRound, X, CircleCheck } from "lucide-react";

// Seleção de várias linhas numa tabela feita no servidor (item 6 da auditoria,
// 30/10/2026). A página envolve a tabela em <SelecaoLista> e põe <MarcarTodos>
// no cabeçalho e <MarcarLinha id> em cada linha; com algo marcado aparece a
// barra embaixo com as ações (cada uma é uma server action que recebe os ids).
// Atividades tem a barra própria (activities/bulk-bar.tsx).

export type ResultadoLote = { ok: true; count: number } | { ok: false; error: string };

const ICONES = { pago: CircleCheck, pessoa: UserRound } as const;

export type AcaoLote =
  | { tipo: "simples"; rotulo: string; icone: keyof typeof ICONES; acao: (ids: string[]) => Promise<ResultadoLote>; sucesso: string; confirmar?: string }
  | {
      tipo: "escolha";
      rotulo: string;
      icone: keyof typeof ICONES;
      opcoes: { valor: string; rotulo: string }[];
      acao: (ids: string[], valor: string) => Promise<ResultadoLote>;
      sucesso: string;
    };

type Ctx = { marcados: Set<string>; alternar: (id: string) => void; todos: string[]; setMarcados: (s: Set<string>) => void };
const Contexto = createContext<Ctx | null>(null);

export function SelecaoLista({
  ids,
  acoes,
  nome,
  children,
}: {
  /** Ids das linhas à vista, na ordem da tabela. */
  ids: string[];
  acoes: AcaoLote[];
  /** [singular, plural] para a barra: ["lançamento", "lançamentos"]. */
  nome: [string, string];
  children: React.ReactNode;
}) {
  const [marcadosCru, setMarcados] = useState<Set<string>>(new Set());
  // some da seleção o que saiu da lista (filtro, exclusão)
  const marcados = useMemo(() => new Set([...marcadosCru].filter((id) => ids.includes(id))), [marcadosCru, ids]);
  const ctx = useMemo<Ctx>(
    () => ({
      marcados,
      todos: ids,
      setMarcados,
      alternar: (id) =>
        setMarcados((s) => {
          const n = new Set(s);
          if (!n.delete(id)) n.add(id);
          return n;
        }),
    }),
    [marcados, ids]
  );
  return (
    <Contexto.Provider value={ctx}>
      {children}
      <BarraLote ids={[...marcados]} acoes={acoes} nome={nome} limpar={() => setMarcados(new Set())} />
    </Contexto.Provider>
  );
}

const CAIXA = "h-4 w-4 cursor-pointer rounded border-border-strong accent-[var(--navy)]";

export function MarcarTodos() {
  const c = useContext(Contexto);
  const ref = useRef<HTMLInputElement>(null);
  const todos = !!c && c.todos.length > 0 && c.marcados.size === c.todos.length;
  const alguns = !!c && c.marcados.size > 0 && !todos;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = alguns;
  }, [alguns]);
  if (!c) return null;
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={todos}
      onChange={() => c.setMarcados(todos ? new Set() : new Set(c.todos))}
      aria-label={todos ? "Desmarcar todos" : "Selecionar todos"}
      className={CAIXA}
    />
  );
}

export function MarcarLinha({ id, rotulo }: { id: string; rotulo: string }) {
  const c = useContext(Contexto);
  if (!c) return null;
  return <input type="checkbox" checked={c.marcados.has(id)} onChange={() => c.alternar(id)} aria-label={`Selecionar ${rotulo}`} className={CAIXA} />;
}

function BarraLote({ ids, acoes, nome, limpar }: { ids: string[]; acoes: AcaoLote[]; nome: [string, string]; limpar: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState<number | null>(null);
  const barra = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menu === null) return;
    const fora = (e: MouseEvent) => {
      if (!barra.current?.contains(e.target as Node)) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  // só existe depois de um clique (nada vem marcado do servidor), então o document já existe
  if (ids.length === 0) return null;
  const qtd = ids.length === 1 ? `1 ${nome[0]}` : `${ids.length} ${nome[1]}`;

  function rodar(p: () => Promise<ResultadoLote>, sucesso: string) {
    setMenu(null);
    start(async () => {
      const r = await p();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(sucesso.replace("{n}", String(r.count)));
      limpar();
      router.refresh();
    });
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div
        ref={barra}
        role="toolbar"
        aria-label={`Ações para ${qtd}`}
        className="pointer-events-auto relative flex animate-enter flex-wrap items-center gap-1 rounded-2xl bg-navy-2 p-1.5 pl-4 text-white shadow-lg"
      >
        <span className="mr-2 text-sm font-medium tabular-nums">{qtd}</span>
        {acoes.map((a, i) => {
          const Icone = ICONES[a.icone];
          return (
            <div key={a.rotulo} className="relative">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (a.tipo === "escolha") return setMenu(menu === i ? null : i);
                  if (a.confirmar && !window.confirm(a.confirmar.replace("{n}", qtd))) return;
                  rodar(() => a.acao(ids), a.sucesso);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <Icone className="h-4 w-4 text-gold-2" aria-hidden />
                {a.rotulo}
                {a.tipo === "escolha" && <ChevronDown className="h-3.5 w-3.5 text-white/50" aria-hidden />}
              </button>
              {a.tipo === "escolha" && menu === i && (
                <ul role="menu" className="absolute bottom-full left-0 mb-2 max-h-72 w-60 animate-enter overflow-y-auto rounded-xl border border-border bg-surface p-1 text-foreground shadow-lg">
                  {a.opcoes.map((o) => (
                    <li key={o.valor}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => rodar(() => a.acao(ids, o.valor), a.sucesso)}
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-foreground/85 hover:bg-surface-2"
                      >
                        <Check className="h-4 w-4 opacity-0" aria-hidden />
                        <span className="truncate">{o.rotulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {pending && <Loader2 className="mx-2 h-4 w-4 animate-spin text-white/70" aria-hidden />}
        <button type="button" onClick={limpar} aria-label="Limpar seleção" className="rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>,
    document.body
  );
}
