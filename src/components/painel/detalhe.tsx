"use client";

import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";

// Número clicável do Painel do Dono (25/10/2026): o cartão diz o que o número
// é; o clique abre uma ficha com o detalhe completo (conteúdo montado no
// servidor e passado como children).

export function ComDetalhe({ titulo, subtitulo, cartao, children, largo = false }: { titulo: string; subtitulo?: string; cartao: React.ReactNode; children: React.ReactNode; largo?: boolean }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = antes;
    };
  }, [aberto]);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="group relative block w-full min-w-0 text-left" aria-haspopup="dialog">
        {cartao}
        <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-0.5 text-[10px] font-medium text-muted opacity-60 transition-opacity group-hover:opacity-100">
          detalhes <ChevronRight className="h-3 w-3" aria-hidden />
        </span>
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={titulo} onClick={() => setAberto(false)}>
          <div className={`max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl ${largo ? "max-w-4xl" : "max-w-2xl"}`} onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-foreground">{titulo}</p>
                {subtitulo && <p className="mt-0.5 text-sm text-muted">{subtitulo}</p>}
              </div>
              <button type="button" className="icon-btn" onClick={() => setAberto(false)} aria-label="Fechar">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="space-y-6">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}

/** Bloco dentro da ficha: título pequeno + conteúdo. */
export function Parte({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2.5 border-b border-border pb-1.5 text-sm font-semibold text-foreground">{titulo}</p>
      {children}
    </section>
  );
}

/** Números lado a lado no topo da ficha. */
export function Numeros({ itens }: { itens: { rotulo: string; valor: string; tom?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="rounded-xl bg-surface-2 px-3 py-2.5">
          <p className="numero-grande text-2xl leading-none" style={i.tom ? { color: i.tom } : undefined}>
            {i.valor}
          </p>
          <p className="mt-1 text-[11px] text-muted">{i.rotulo}</p>
        </div>
      ))}
    </div>
  );
}
