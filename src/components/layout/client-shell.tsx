"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { NavTrail } from "@/components/nav/nav-trail";
import { Avatar } from "@/components/ui/avatar";
import { TemaBotao } from "@/components/ui/tema-botao";
import { Home, Inbox, FolderOpen, LayoutGrid, Plus, type LucideIcon } from "lucide-react";

// Portal do cliente: acompanhar o que o escritório está fazendo e fazer
// pedidos (sem horas e sem financeiro). No computador, menu no topo; no
// celular, barra fixa embaixo com o botão de pedido no meio.
type Item = { href: string; label: string; icon: LucideIcon; tambem?: string[] };

const NAV_ITEMS: Item[] = [
  { href: "/dashboard", label: "Início", icon: Home },
  { href: "/dashboard/pedidos", label: "Pedidos", icon: Inbox },
  { href: "/dashboard/documentos", label: "Documentos", icon: FolderOpen },
  { href: "/dashboard/mais", label: "Mais", icon: LayoutGrid, tambem: ["/dashboard/activities", "/dashboard/processos", "/dashboard/relatorios", "/account"] },
];

export function ClientShell({
  children,
  userName,
  clientName,
}: {
  children: React.ReactNode;
  userName: string;
  clientName: string;
}) {
  const pathname = usePathname();
  const ativo = (item: Item) =>
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href) || !!item.tambem?.some((p) => pathname.startsWith(p));
  const naTelaDePedido = pathname.startsWith("/dashboard/pedidos/novo");

  return (
    <div className="min-h-dvh w-full bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 overflow-hidden rounded-full ring-1 ring-gold/40">
              <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={32} height={32} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-display text-sm font-bold text-foreground">MC Advogados</span>
              <span className="eyebrow block truncate !text-[9px]">{clientName}</span>
            </span>
          </Link>

          {/* menu no topo (computador/tablet) */}
          <nav className="mx-auto hidden items-center gap-1 rounded-full border border-border bg-surface p-1 sm:flex" aria-label="Menu do portal">
            {NAV_ITEMS.map((item) => {
              const on = ativo(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors ${
                    on ? "bg-navy font-medium text-white" : "text-foreground/60 hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <TemaBotao />
            {!naTelaDePedido && (
              <Link href="/dashboard/pedidos/novo" className="ui-btn hidden px-3.5 py-2 text-sm md:inline-flex">
                <Plus className="h-4 w-4" aria-hidden /> Pedido
              </Link>
            )}
            <Link href="/account" className="rounded-full transition-opacity hover:opacity-85" title={`${userName} · Minha conta`} aria-label="Minha conta">
              <Avatar nome={userName} tamanho={34} />
            </Link>
          </div>
        </div>
      </header>

      <main key={pathname} className="mx-auto max-w-5xl px-4 pt-7 pb-32 animate-page sm:px-6 sm:pt-12 sm:pb-16">
        {children}
      </main>

      {/* barra fixa embaixo (celular), com o pedido no meio */}
      <nav
        aria-label="Menu do portal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="grid grid-cols-5 items-end">
          {[...NAV_ITEMS.slice(0, 2), null, ...NAV_ITEMS.slice(2)].map((item) => {
            if (!item) {
              return (
                <li key="novo" className="flex justify-center">
                  <Link
                    href="/dashboard/pedidos/novo"
                    aria-label="Fazer um pedido"
                    className="-mt-5 mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-navy text-gold-2 shadow-lg shadow-navy/25 ring-4 ring-surface transition-transform active:scale-95"
                  >
                    <Plus className="h-6 w-6" aria-hidden />
                  </Link>
                </li>
              );
            }
            const on = ativo(item);
            const Icone = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium transition-colors ${on ? "text-navy" : "text-muted"}`}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${on ? "bg-navy/[0.08]" : ""}`}>
                    <Icone className="h-5 w-5" aria-hidden />
                  </span>
                  {item.label === "Documentos" ? "Docs" : item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Suspense fallback={null}>
        <NavTrail />
      </Suspense>
    </div>
  );
}
