"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search, Building2, type LucideIcon } from "lucide-react";

export type PaletteItem = { href: string; label: string; group: string; icon?: LucideIcon; hint?: string };

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Busca rápida (Ctrl+K / ⌘K): pula para qualquer tela ou cliente.
export function CommandPalette({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const resultados = useMemo(() => {
    const q = normalizar(busca.trim());
    const lista = q ? items.filter((i) => normalizar(`${i.label} ${i.hint ?? ""}`).includes(q)) : items;
    return lista.slice(0, 40);
  }, [busca, items]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>(`[data-index="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  function fechar() {
    onOpenChange(false);
    setBusca("");
    setAtivo(0);
  }

  function ir(item: PaletteItem | undefined) {
    if (!item) return;
    fechar();
    router.push(item.href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Busca rápida">
      <button type="button" aria-label="Fechar busca" onClick={fechar} className="absolute inset-0 bg-navy-2/40 backdrop-blur-[2px] animate-[enter_160ms_var(--ease-out)_both]" />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-lg animate-enter">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setAtivo(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") fechar();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setAtivo((a) => Math.min(a + 1, resultados.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAtivo((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                ir(resultados[ativo]);
              }
            }}
            placeholder="Buscar cliente ou tela…"
            className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none focus-visible:outline-none placeholder:text-muted/70"
          />
          <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">Esc</kbd>
        </div>
        <ul ref={listaRef} className="max-h-[50vh] overflow-y-auto p-2">
          {resultados.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nada encontrado para “{busca}”.</li>}
          {resultados.map((item, i) => {
            const Icone = item.icon ?? Building2;
            const cabecalho = i === 0 || resultados[i - 1].group !== item.group ? item.group : null;
            return (
              <li key={item.href + item.label}>
                {cabecalho && <p className="px-3 pt-3 pb-1.5 text-[11px] font-medium text-muted">{cabecalho}</p>}
                <button
                  type="button"
                  data-index={i}
                  onMouseMove={() => setAtivo(i)}
                  onClick={() => ir(item)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    i === ativo ? "bg-navy text-white" : "text-foreground"
                  }`}
                >
                  <Icone className={`h-4 w-4 shrink-0 ${i === ativo ? "text-gold-2" : "text-muted"}`} aria-hidden />
                  <span className="flex-1 truncate">{item.label}</span>
                  {i === ativo && <CornerDownLeft className="h-3.5 w-3.5 text-white/60" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
