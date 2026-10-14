"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  LayoutDashboard,
  Users,
  ListChecks,
  Gavel,
  FileText,
  FileSignature,
  Wallet,
  ClipboardList,
  BarChart3,
  UserCog,
  Plug,
  Trash2,
  Search,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  UserRound,
  type LucideIcon,
  Newspaper,
  Bell,
  CalendarDays,
} from "lucide-react";
import { logout } from "@/app/logout/actions";
import { CommandPalette, type PaletteItem } from "./command-palette";
import { PERM_DA_TELA, type Permissoes } from "@/lib/permissoes";
import { NavTrail } from "@/components/nav/nav-trail";
import { AtividadeModalProvider } from "@/components/atividade/atividade-modal";
import { Assistente } from "@/components/assistente/assistente";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  advogado: "Advogado",
};

type NavItem = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean };

// Advogado vê só as telas que o admin liberou (PERM_DA_TELA); Financeiro,
// Equipe, Integrações e Lixeira são sempre só do admin.
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Dia a dia",
    items: [
      { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
      { href: "/admin/clients", label: "Clientes", icon: Users },
      { href: "/admin/activities", label: "Atividades", icon: ListChecks },
      { href: "/admin/publicacoes", label: "Publicações", icon: Newspaper },
      { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/admin/onboarding", label: "Onboarding", icon: ClipboardList },
    ],
  },
  {
    label: "Arquivo",
    items: [
      { href: "/admin/documents", label: "Documentos", icon: FileText },
      { href: "/admin/contracts", label: "Contratos", icon: FileSignature },
      { href: "/admin/processes", label: "Processos", icon: Gavel },
    ],
  },
  {
    label: "Escritório",
    items: [
      { href: "/admin/reports", label: "Relatórios", icon: BarChart3 },
      { href: "/admin/financial", label: "Financeiro", icon: Wallet, adminOnly: true },
      { href: "/admin/team", label: "Equipe", icon: UserCog, adminOnly: true },
      { href: "/admin/integracoes", label: "Integrações", icon: Plug, adminOnly: true },
      { href: "/admin/lixeira", label: "Lixeira", icon: Trash2, adminOnly: true },
    ],
  },
];

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

// preferência "menu recolhido", guardada no navegador
const CHAVE = "mc:sidebar-recolhida";
const ouvintes = new Set<() => void>();
function lerRecolhida() {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}
function gravarRecolhida(v: boolean) {
  try {
    localStorage.setItem(CHAVE, v ? "1" : "0");
  } catch {}
  ouvintes.forEach((f) => f());
}

export function AdminShell({
  children,
  userName,
  userRole,
  clients = [],
  permissoes,
  publicacoesPendentes = 0,
}: {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  clients?: { id: string; name: string }[];
  permissoes: Permissoes;
  /** Sininho (só admin): publicações do DJEN ainda não tratadas. */
  publicacoesPendentes?: number;
}) {
  const pathname = usePathname();
  const recolhida = useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    lerRecolhida,
    () => false
  );
  const [menuMobile, setMenuMobile] = useState(false);
  const [busca, setBusca] = useState(false);

  const grupos = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (userRole === "admin") return true;
      const chave = PERM_DA_TELA[i.href];
      return !!chave && permissoes[chave];
    }),
  })).filter((g) => g.items.length > 0);

  const ativo = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const itensBusca = useMemo<PaletteItem[]>(
    () => [
      ...grupos.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, group: "Telas", icon: i.icon }))),
      ...clients.map((c) => ({ href: `/admin/clients/${c.id}`, label: c.name, group: "Clientes" })),
      { href: "/account", label: "Minha conta", group: "Conta", icon: UserRound },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- grupos deriva só de userRole
    [clients, userRole]
  );

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBusca((b) => !b);
      }
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  // fecha o menu do celular ao trocar de página
  const [rotaMenu, setRotaMenu] = useState(pathname);
  if (rotaMenu !== pathname) {
    setRotaMenu(pathname);
    setMenuMobile(false);
  }

  const compacta = recolhida && !menuMobile;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-3 px-4 pt-5 pb-4 ${compacta ? "justify-center px-0" : ""}`}>
        <div className="shrink-0 overflow-hidden rounded-full ring-1 ring-gold/40">
          <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={34} height={34} />
        </div>
        {!compacta && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-white">MC Advogados</p>
            <p className="truncate text-xs text-white/50">Painel do escritório</p>
          </div>
        )}
        {menuMobile && (
          <button type="button" onClick={() => setMenuMobile(false)} aria-label="Fechar menu" className="ml-auto rounded-lg p-1.5 text-white/70 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className={compacta ? "px-2" : "px-3"}>
        <button
          type="button"
          onClick={() => setBusca(true)}
          title="Buscar (Ctrl+K)"
          className={`flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 py-2 text-sm text-white/60 transition-colors hover:border-white/20 hover:text-white ${
            compacta ? "justify-center px-0" : "px-3"
          }`}
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          {!compacta && (
            <>
              <span className="flex-1 text-left">Buscar</span>
              <kbd className="rounded border border-white/15 px-1.5 text-[10px] font-medium text-white/50">Ctrl K</kbd>
            </>
          )}
        </button>
      </div>

      {publicacoesPendentes > 0 && (
        <div className={`mt-2 ${compacta ? "px-2" : "px-3"}`}>
          <Link
            href="/admin/publicacoes"
            title={`${publicacoesPendentes} publicações não tratadas`}
            className={`relative flex items-center gap-2.5 rounded-lg border border-gold/40 bg-gold/10 py-2 text-sm text-gold-2 transition-colors hover:bg-gold/20 ${
              compacta ? "justify-center px-0" : "px-3"
            }`}
          >
            <Bell className="h-4 w-4 shrink-0 animate-[pulse_2.4s_ease-in-out_3]" aria-hidden />
            {!compacta && (
              <span className="flex-1 truncate">
                {publicacoesPendentes} {publicacoesPendentes === 1 ? "publicação nova" : "não tratadas"}
              </span>
            )}
          </Link>
        </div>
      )}

      <nav className={`mt-4 flex-1 space-y-5 overflow-y-auto pb-4 ${compacta ? "px-2" : "px-3"}`} aria-label="Menu principal">
        {grupos.map((g) => (
          <div key={g.label}>
            {!compacta && <p className="mb-1.5 px-3 text-[11px] font-medium text-white/40">{g.label}</p>}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const on = ativo(item.href);
                const Icone = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={compacta ? item.label : undefined}
                      aria-current={on ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-lg py-2 text-sm transition-colors duration-150 ${
                        compacta ? "justify-center px-0" : "px-3"
                      } ${on ? "bg-white/10 font-medium text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white"}`}
                    >
                      {on && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-gold" aria-hidden />}
                      <Icone
                        className={`h-[18px] w-[18px] shrink-0 transition-colors ${on ? "text-gold-2" : "text-white/50 group-hover:text-white/80"}`}
                        aria-hidden
                      />
                      {!compacta && <span className="truncate">{item.label}</span>}
                      {item.href === "/admin/publicacoes" && publicacoesPendentes > 0 && (
                        <span
                          className={`rounded-full bg-gold px-1.5 text-[10px] leading-4 font-semibold text-navy-2 ${compacta ? "absolute top-0.5 right-0.5" : "ml-auto"}`}
                          aria-label={`${publicacoesPendentes} não tratadas`}
                        >
                          {publicacoesPendentes > 99 ? "99+" : publicacoesPendentes}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={`border-t border-white/10 py-3 ${compacta ? "px-2" : "px-3"}`}>
        <div className={`flex items-center gap-3 rounded-lg py-1.5 ${compacta ? "flex-col px-0" : "px-2"}`}>
          <Link
            href="/account"
            title="Minha conta"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-soft text-xs font-semibold text-gold-ink ring-1 ring-gold/50 transition-transform hover:scale-105"
          >
            {iniciais(userName) || "MC"}
          </Link>
          {!compacta && (
            <Link href="/account" className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-medium text-white">{userName}</p>
              <p className="truncate text-[11px] text-white/50">{ROLE_LABEL[userRole] ?? userRole}</p>
            </Link>
          )}
          <form action={logout}>
            <button type="submit" title="Sair" aria-label="Sair" className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
        <button
          type="button"
          onClick={() => gravarRecolhida(!recolhida)}
          className={`mt-1 hidden w-full items-center gap-2 rounded-lg py-1.5 text-xs text-white/40 transition-colors hover:text-white/80 lg:flex ${
            compacta ? "justify-center" : "px-2"
          }`}
          aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
        >
          {recolhida ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!compacta && "Recolher menu"}
        </button>
      </div>
    </div>
  );

  return (
    <AtividadeModalProvider>
    <div className="flex min-h-screen w-full">
      {/* menu fixo (computador) */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 bg-navy-2 transition-[width] duration-200 ease-[var(--ease-out)] lg:block ${
          recolhida ? "w-[68px]" : "w-64"
        }`}
      >
        {sidebar}
      </aside>

      {/* menu gaveta (celular) */}
      {menuMobile && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Fechar menu" onClick={() => setMenuMobile(false)} className="absolute inset-0 bg-navy-2/50" />
          <aside className="relative h-full w-72 bg-navy-2 shadow-lg animate-[enter_200ms_var(--ease-out)_both]">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-surface/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setMenuMobile(true)} aria-label="Abrir menu" className="rounded-lg p-1.5 text-foreground hover:bg-surface-2">
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/brand/logo_mc.jpg" alt="" width={26} height={26} className="rounded-full" />
          <p className="text-sm font-semibold text-foreground">MC Advogados</p>
          {publicacoesPendentes > 0 && (
            <Link href="/admin/publicacoes" aria-label={`${publicacoesPendentes} publicações não tratadas`} className="relative ml-auto rounded-lg p-1.5 text-muted hover:bg-surface-2">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-0.5 -right-0.5 rounded-full bg-gold px-1 text-[10px] leading-4 font-semibold text-navy-2">
                {publicacoesPendentes > 99 ? "99+" : publicacoesPendentes}
              </span>
            </Link>
          )}
          <button type="button" onClick={() => setBusca(true)} aria-label="Buscar" className={`${publicacoesPendentes > 0 ? "" : "ml-auto "}rounded-lg p-1.5 text-muted hover:bg-surface-2`}>
            <Search className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1">
          <div key={pathname} className="mx-auto w-full max-w-6xl px-4 py-6 animate-page sm:px-6 lg:px-10 lg:py-9">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={busca} onOpenChange={setBusca} items={itensBusca} />
      {(userRole === "admin" || userRole === "advogado") && permissoes.assistente && <Assistente nome={userName.split(" ")[0] ?? ""} />}
      <Suspense fallback={null}>
        <NavTrail />
      </Suspense>
    </div>
    </AtividadeModalProvider>
  );
}
