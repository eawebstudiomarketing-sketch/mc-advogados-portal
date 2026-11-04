"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";
import { novidadeVistaAction } from "@/app/admin/novidades/actions";
import type { Novidade, ItemNovidade } from "@/lib/novidades";

// Janela "Novidades" (04/11/2026), no estilo do "What's new" do Chrome: abre
// sozinha uma vez quando sai algo novo no portal, com um item por vez (print,
// o que é e como usar). Fechar marca como vista; depois só em Caixa de entrada →
// Novidades.

export function ItemDaNovidade({ item }: { item: ItemNovidade }) {
  return (
    <div>
      {item.imagem && (
        // eslint-disable-next-line @next/next/no-img-element -- print guardado no Storage público
        <img src={item.imagem} alt={`Print: ${item.titulo}`} className="mb-3 max-h-[46vh] w-full rounded-xl border border-border bg-surface-2 object-contain" loading="lazy" />
      )}
      <p className="text-base font-semibold text-foreground">{item.titulo}</p>
      <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">{item.texto}</p>
      {!!item.como_usar?.length && (
        <div className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5">
          <p className="eyebrow mb-1">Como usar</p>
          <ol className="list-decimal space-y-0.5 pl-4 text-sm text-foreground/85">
            {item.como_usar.map((p, k) => (
              <li key={k}>{p}</li>
            ))}
          </ol>
        </div>
      )}
      {item.link && (
        <Link href={item.link} className="ui-link mt-2 inline-block text-sm">
          Abrir no portal ›
        </Link>
      )}
    </div>
  );
}

export function JanelaNovidades({ novidade }: { novidade: Novidade }) {
  const [aberta, setAberta] = useState(true);
  const [k, setK] = useState(0);
  const total = novidade.itens.length;
  const fechar = () => {
    setAberta(false);
    void novidadeVistaAction(novidade.id);
  };

  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowRight") setK((x) => Math.min(total - 1, x + 1));
      if (e.key === "ArrowLeft") setK((x) => Math.max(0, x - 1));
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fechar só depende do id
  }, [aberta, total]);

  if (!aberta || !total) return null;
  const item = novidade.itens[k];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-2/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={novidade.titulo}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface shadow-lg animate-[enter_200ms_var(--ease-out)_both]">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-ink">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Novidades no portal</p>
            <h2 className="text-lg font-medium text-foreground">{novidade.titulo}</h2>
            {novidade.resumo && <p className="text-sm text-muted">{novidade.resumo}</p>}
          </div>
          <button type="button" onClick={fechar} className="icon-btn -mr-2" aria-label="Fechar" data-tip="Fechar (Esc)">
            <X aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ItemDaNovidade key={k} item={item} />
        </div>
        <footer className="flex items-center gap-3 border-t border-border px-5 py-3">
          <span className="flex gap-1" aria-hidden>
            {novidade.itens.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === k ? "w-5 bg-navy" : "w-1.5 bg-border-strong"}`} />
            ))}
          </span>
          <span className="text-xs text-muted tabular-nums">
            {k + 1} de {total}
          </span>
          <span className="flex-1" />
          <Link href="/admin/novidades" onClick={fechar} className="hidden text-xs text-muted hover:text-foreground sm:inline">
            Ver todas depois em Novidades
          </Link>
          {k > 0 && (
            <button type="button" onClick={() => setK(k - 1)} className="ui-btn-secondary px-3 py-1.5 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Voltar
            </button>
          )}
          {k < total - 1 ? (
            <button type="button" onClick={() => setK(k + 1)} className="ui-btn px-3 py-1.5 text-xs">
              Próximo <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={fechar} className="ui-btn px-3 py-1.5 text-xs">
              Entendi
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
