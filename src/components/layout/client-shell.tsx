"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { NavTrail } from "@/components/nav/nav-trail";
import { LayoutDashboard, ListChecks, Gavel, FileBarChart2, FolderOpen, LogOut, type LucideIcon } from "lucide-react";
import { logout } from "@/app/logout/actions";

// Portal do cliente: acompanhar o que o escritório está fazendo (sem horas e
// sem financeiro). No computador, abas no topo; no celular, barra fixa embaixo.
const NAV_ITEMS: { href: string; label: string; curto: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Visão geral", curto: "Início", icon: LayoutDashboard },
  { href: "/dashboard/activities", label: "Atividades", curto: "Atividades", icon: ListChecks },
  { href: "/dashboard/processos", label: "Processos", curto: "Processos", icon: Gavel },
  { href: "/dashboard/relatorios", label: "Relatórios", curto: "Relatórios", icon: FileBarChart2 },
  { href: "/dashboard/documentos", label: "Documentos", curto: "Docs", icon: FolderOpen },
];

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

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
  const ativo = (href: string) => (href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href));

  return (
    <div className="min-h-dvh w-full bg-background">
      <header className="bg-navy-2 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6 sm:pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 overflow-hidden rounded-full ring-1 ring-gold/40">
              <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={34} height={34} />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">MC Advogados</p>
              <p className="truncate text-xs text-white/55">{clientName}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Link href="/account" className="flex items-center gap-2.5 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.06]" title="Minha conta">
              <span className="hidden text-right leading-tight sm:block">
                <span className="block text-xs font-medium">{userName}</span>
                <span className="block text-[11px] text-white/50">Minha conta</span>
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-soft text-xs font-semibold text-gold-ink ring-1 ring-gold/50">
                {iniciais(userName) || "MC"}
              </span>
            </Link>
            <form action={logout}>
              <button type="submit" title="Sair" aria-label="Sair" className="rounded-lg p-2.5 text-white/55 transition-colors hover:bg-white/10 hover:text-white">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        {/* abas no topo (computador/tablet) */}
        <nav className="mx-auto hidden max-w-5xl gap-1 px-6 sm:flex" aria-label="Menu do portal">
          {NAV_ITEMS.map((item) => {
            const on = ativo(item.href);
            const Icone = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={`relative inline-flex items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
                  on ? "font-medium text-white" : "text-white/60 hover:text-white"
                }`}
              >
                <Icone className={`h-4 w-4 ${on ? "text-gold-2" : ""}`} aria-hidden />
                {item.label}
                {on && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gold" aria-hidden />}
              </Link>
            );
          })}
        </nav>
      </header>

      <main key={pathname} className="mx-auto max-w-5xl px-4 pt-6 pb-28 animate-page sm:px-6 sm:pt-9 sm:pb-12">
        {children}
      </main>

      {/* barra de navegação fixa embaixo (celular) */}
      <nav
        aria-label="Menu do portal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const on = ativo(item.href);
            const Icone = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium transition-colors ${on ? "text-navy" : "text-muted"}`}
                >
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${on ? "bg-navy/[0.08]" : ""}`}>
                    <Icone className={`h-5 w-5 ${on ? "text-navy" : ""}`} aria-hidden />
                  </span>
                  {item.curto}
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
