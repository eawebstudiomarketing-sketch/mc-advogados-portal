"use client";

import { LinkMenu as Link } from "./link-menu";
import type { Secao } from "./secoes";

/**
 * Abas no topo da página para trocar de tela dentro da mesma seção do menu
 * (ex.: Demandas → Atividades · Rotinas · Agenda). Só aparece nas telas de
 * lista da seção, não nas fichas de dentro (que já têm as abas delas).
 */
export function AbasSecao({ secao, pathname, badge }: { secao: Secao; pathname: string; badge: (href: string) => number }) {
  if (secao.abas.length < 2 || !secao.abas.some((a) => a.href === pathname)) return null;
  return (
    <nav aria-label={`Telas de ${secao.label}`} className="-mx-1 mb-6 overflow-x-auto px-1 pb-1">
      <ul className="inline-flex gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {secao.abas.map((a) => {
          const on = a.href === pathname;
          const Icone = a.icon;
          const n = badge(a.href);
          return (
            <li key={a.href}>
              <Link
                href={a.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-9 items-center gap-2 rounded-lg px-3 text-sm whitespace-nowrap transition-colors duration-150 ${
                  on ? "bg-surface font-semibold text-foreground shadow-sm ring-1 ring-border" : "font-medium text-muted hover:text-foreground"
                }`}
              >
                <Icone className="h-4 w-4 shrink-0" aria-hidden />
                {a.label}
                {n > 0 && (
                  <span className="rounded-full bg-navy px-1.5 text-[10px] leading-4 font-semibold text-white tabular-nums" aria-label={`${n} pendentes`}>
                    {n > 99 ? "99+" : n}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
