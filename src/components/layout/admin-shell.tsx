"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Activity, LayoutDashboard, Users, ListChecks, Gavel, FileText, FileSignature, Wallet, ClipboardList, BarChart3, UserCog, Plug, Trash2, Search, Menu, X, LogOut, UserRound, type LucideIcon, Briefcase, Layers, Settings2, ChevronDown, Newspaper, Bell, CalendarDays, MessageCircle, MessagesSquare, Inbox, CalendarCheck, BellRing, AudioLines, NotebookPen, Sparkles, Wrench, Gauge } from "lucide-react";
import { logout } from "@/app/logout/actions";
import { CommandPalette, type PaletteItem } from "./command-palette";
import { PERM_DA_TELA, type Permissoes } from "@/lib/permissoes";
import { TemaBotao } from "@/components/ui/tema-botao";
import { NavTrail } from "@/components/nav/nav-trail";
import { AtividadeModalProvider } from "@/components/atividade/atividade-modal";
import { Assistente } from "@/components/assistente/assistente";
import { createClient as criarSupabase } from "@/lib/supabase/client";
import { contarNaoLidasAction } from "@/app/admin/mensagens/actions";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  advogado: "Advogado",
};

type NavItem = { href: string; label: string; icon: LucideIcon; todos?: boolean; soSuper?: boolean };

// Menu em 3 grandes áreas que abrem as subopções ao clicar (a Visão geral
// fica solta no topo). Cada pessoa vê só as telas liberadas para ela
// (PERM_DA_TELA); o admin máximo vê tudo.
const INICIO: NavItem = { href: "/admin", label: "Área de trabalho", icon: LayoutDashboard };
const NAV_GROUPS: { id: string; label: string; icon: LucideIcon; items: NavItem[] }[] = [
  {
    id: "comercial",
    label: "Comercial",
    icon: Briefcase,
    items: [
      { href: "/admin/clients", label: "Contatos", icon: Users },
      { href: "/admin/contracts", label: "Contratos", icon: FileSignature },
      { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
    ],
  },
  {
    id: "operacional",
    label: "Operacional",
    icon: Layers,
    items: [
      { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/admin/distribuicao", label: "Distribuição", icon: Inbox },
      { href: "/admin/onboarding", label: "Onboarding", icon: ClipboardList },
      { href: "/admin/activities", label: "Atividades", icon: ListChecks },
      { href: "/admin/rotinas", label: "Rotinas", icon: CalendarCheck, todos: true },
      { href: "/admin/publicacoes", label: "Publicações", icon: Newspaper },
      { href: "/admin/alertas", label: "Alertas", icon: BellRing },
      { href: "/admin/processes", label: "Processos e casos", icon: Gavel },
      { href: "/admin/documents", label: "Documentos", icon: FileText },
    ],
  },
  {
    // ferramentas do dia a dia (23/10/2026): IA em tela grande, transcrição, atas
    // e as próximas que forem criadas
    id: "ferramentas",
    label: "Ferramentas",
    icon: Wrench,
    items: [
      { href: "/admin/ia", label: "IA", icon: Sparkles },
      { href: "/admin/transcricao", label: "Transcrição", icon: AudioLines, todos: true },
      { href: "/admin/atas", label: "Reuniões", icon: NotebookPen },
    ],
  },
  {
    id: "gestao",
    label: "Gestão",
    icon: Settings2,
    items: [
      { href: "/admin/painel", label: "Painel do Dono", icon: Gauge, soSuper: true },
      { href: "/admin/indicadores", label: "Indicadores", icon: Activity, todos: true },
      { href: "/admin/reports", label: "Relatórios", icon: BarChart3 },
      { href: "/admin/financial", label: "Financeiro", icon: Wallet },
      { href: "/admin/team", label: "Equipe", icon: UserCog },
      { href: "/admin/mensagens", label: "Mensagens", icon: MessagesSquare, todos: true },
      { href: "/admin/integracoes", label: "Integrações", icon: Plug },
      { href: "/admin/lixeira", label: "Lixeira", icon: Trash2 },
    ],
  },
];

// grupos abertos no menu (lembrado no navegador; texto JSON para o
// useSyncExternalStore comparar sem recriar o array a cada leitura)
const CHAVE_GRUPOS = "mc:menu-grupos-v2"; // v2: grupo Ferramentas (abre aberto pra todos)
const PADRAO_GRUPOS = JSON.stringify(["comercial", "operacional", "ferramentas", "gestao"]);
const ouvintesGrupos = new Set<() => void>();
function lerGruposCru(): string {
  try {
    return localStorage.getItem(CHAVE_GRUPOS) ?? PADRAO_GRUPOS;
  } catch {
    return PADRAO_GRUPOS;
  }
}
function gravarGrupos(v: string[]) {
  try {
    localStorage.setItem(CHAVE_GRUPOS, JSON.stringify(v));
  } catch {}
  ouvintesGrupos.forEach((f) => f());
}

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function AdminShell({
  children,
  userName,
  userRole,
  clients = [],
  permissoes,
  publicacoesPendentes = 0,
  mensagensNaoLidas = 0,
  distribuicaoPendentes = 0,
  superAdmin = false,
}: {
  children: React.ReactNode;
  userName: string;
  userRole: string;
  clients?: { id: string; name: string }[];
  permissoes: Permissoes;
  /** Sininho (só admin): publicações do DJEN ainda não tratadas. */
  publicacoesPendentes?: number;
  /** Mensagens internas + avisos não lidos (todo mundo da equipe). */
  mensagensNaoLidas?: number;
  /** Demandas que chegaram de fora e ainda não foram distribuídas. */
  distribuicaoPendentes?: number;
  /** Admin máximo (Maurício e João): vê o Painel do Dono. */
  superAdmin?: boolean;
}) {
  const pathname = usePathname();
  // não lidas (mensagens + avisos): começa com o número do servidor e
  // recalcula quando chega mensagem/aviso novo ou quando troca de tela
  const [naoLidas, setNaoLidas] = useState(mensagensNaoLidas);
  useEffect(() => {
    let vivo = true;
    void contarNaoLidasAction().then((n) => vivo && setNaoLidas(n));
    return () => {
      vivo = false;
    };
  }, [pathname]);
  useEffect(() => {
    const supabase = criarSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recontar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void contarNaoLidasAction().then(setNaoLidas), 800);
    };
    const canal = supabase
      .channel("menu-nao-lidas")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_mensagens" }, recontar)
      .on("postgres_changes", { event: "*", schema: "public", table: "avisos" }, recontar)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(canal);
    };
  }, []);
  const [menuMobile, setMenuMobile] = useState(false);
  const [busca, setBusca] = useState(false);

  const grupos = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.soSuper) return superAdmin;
      if (i.todos) return true;
      const chave = PERM_DA_TELA[i.href];
      return !!chave && permissoes[chave];
    }),
  })).filter((g) => g.items.length > 0);

  const ativo = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const grupoAtivo = grupos.find((g) => g.items.some((i) => ativo(i.href)))?.id;
  // grupos abertos: o que a pessoa deixou aberto (o grupo da tela atual
  // fechado mostra uma bolinha no ícone)
  const abertosSalvos = useSyncExternalStore(
    (f) => {
      ouvintesGrupos.add(f);
      return () => ouvintesGrupos.delete(f);
    },
    () => lerGruposCru(),
    () => PADRAO_GRUPOS
  );
  const abertos: string[] = JSON.parse(abertosSalvos);
  const alternarGrupo = (id: string) => gravarGrupos(abertos.includes(id) ? abertos.filter((x) => x !== id) : [...abertos, id]);

  const itensBusca = useMemo<PaletteItem[]>(
    () => [
      { href: INICIO.href, label: INICIO.label, group: "Telas", icon: INICIO.icon },
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

  const badge = (href: string) =>
    href === "/admin/mensagens" ? naoLidas : href === "/admin/distribuicao" ? distribuicaoPendentes : href === "/admin/publicacoes" ? publicacoesPendentes : 0;

  // item do menu. "sempre" = gaveta do celular (nomes sempre à mostra);
  // "hover" = trilho fino do computador (nome aparece quando o menu abre).
  const itemNav = (item: NavItem, modo: "hover" | "sempre") => {
    const on = ativo(item.href);
    const Icone = item.icon;
    const n = badge(item.href);
    const rotulo = modo === "hover" ? "opacity-0 transition-opacity duration-150 group-hover/menu:opacity-100 group-focus-within/menu:opacity-100" : "";
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={on ? "page" : undefined}
          aria-label={item.label}
          className={`relative flex h-10 items-center gap-3 rounded-lg px-[11px] text-sm whitespace-nowrap transition-colors duration-150 ${
            on ? "bg-navy/10 text-navy-3" : "text-muted hover:bg-hover hover:text-foreground"
          }`}
        >
          <Icone className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className={`flex-1 truncate font-medium ${rotulo}`}>{item.label}</span>
          {n > 0 && (
            <>
              <span
                className={`rounded-full px-1.5 text-[10px] leading-4 font-semibold tabular-nums ${on ? "bg-gold text-navy-2" : "bg-navy text-white"} ${rotulo}`}
                aria-label={`${n} pendentes`}
              >
                {n > 99 ? "99+" : n}
              </span>
              {modo === "hover" && (
                <span className="absolute top-2 left-7 h-2 w-2 rounded-full bg-gold ring-2 ring-white transition-opacity group-hover/menu:opacity-0" aria-hidden />
              )}
            </>
          )}
        </Link>
      </li>
    );
  };

  const menu = (modo: "hover" | "sempre") => (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-3 px-[14px]">
        <div className="shrink-0 overflow-hidden rounded-full ring-1 ring-border">
          <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={34} height={34} />
        </div>
        <div className={`min-w-0 leading-tight whitespace-nowrap ${modo === "hover" ? "opacity-0 transition-opacity group-hover/menu:opacity-100 group-focus-within/menu:opacity-100" : ""}`}>
          <p className="font-display text-[15px] font-bold tracking-tight text-foreground">MC Advogados</p>
          <p className="eyebrow">Painel do escritório</p>
        </div>
        {modo === "sempre" && (
          <button type="button" onClick={() => setMenuMobile(false)} aria-label="Fechar menu" className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface-2 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-[10px] pt-2 pb-4" aria-label="Menu principal">
        <ul>{itemNav(INICIO, modo)}</ul>
        {grupos.map((g) => {
          const aberto = abertos.includes(g.id);
          const IconeGrupo = g.icon;
          const pendentes = g.items.reduce((s, i) => s + badge(i.href), 0);
          const temAtivo = g.id === grupoAtivo;
          const rotulo = modo === "hover" ? "opacity-0 transition-opacity duration-150 group-hover/menu:opacity-100 group-focus-within/menu:opacity-100" : "";
          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => alternarGrupo(g.id)}
                aria-expanded={aberto}
                className={`relative flex h-10 w-full items-center gap-3 rounded-xl px-[11px] text-left text-sm whitespace-nowrap transition-colors hover:bg-hover ${
                  temAtivo && !aberto ? "text-foreground" : "text-foreground/70"
                }`}
              >
                <IconeGrupo className="h-[18px] w-[18px] shrink-0" aria-hidden />
                <span className={`flex-1 font-display text-[14px] font-bold tracking-tight ${rotulo}`}>{g.label}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${aberto ? "" : "-rotate-90"} ${rotulo}`} aria-hidden />
                {!aberto && (pendentes > 0 || temAtivo) && (
                  <span className={`absolute top-2 left-7 h-2 w-2 rounded-full ring-2 ring-white ${temAtivo ? "bg-navy" : "bg-gold"}`} aria-hidden />
                )}
              </button>
              {aberto && (
                <ul className={`mt-0.5 space-y-0.5 ${modo === "hover" ? "group-hover/menu:ml-3 group-hover/menu:border-l group-hover/menu:border-border group-hover/menu:pl-2" : "ml-3 border-l border-border pl-2"}`}>
                  {g.items.map((i) => itemNav(i, modo))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border px-[10px] py-3">
        <Link
          href="/account"
          className="flex h-11 items-center gap-3 rounded-xl px-[6px] whitespace-nowrap hover:bg-hover"
          aria-label="Minha conta"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-gold-2">{iniciais(userName) || "MC"}</span>
          <span className={`min-w-0 leading-tight ${modo === "hover" ? "opacity-0 transition-opacity group-hover/menu:opacity-100 group-focus-within/menu:opacity-100" : ""}`}>
            <span className="block truncate text-xs font-semibold text-foreground">{userName}</span>
            <span className="block truncate text-[11px] text-muted">{ROLE_LABEL[userRole] ?? userRole}</span>
          </span>
        </Link>
        {modo === "sempre" && (
          <form action={logout} className="mt-1">
            <button type="submit" className="flex h-10 w-full items-center gap-3 rounded-xl px-[11px] text-sm font-medium text-foreground/60 hover:bg-hover hover:text-foreground">
              <LogOut className="h-[18px] w-[18px]" aria-hidden /> Sair
            </button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <AtividadeModalProvider>
    <div className="flex min-h-screen w-full bg-background">
      {/* computador: menu fixo com os nomes sempre à vista (como no Astrea) */}
      <div className="sticky top-0 z-40 hidden h-screen w-[232px] shrink-0 lg:block">
        <aside className="absolute inset-y-0 left-0 z-40 w-[232px] overflow-hidden border-r border-border bg-surface">
          {menu("sempre")}
        </aside>
      </div>

      {/* celular: gaveta com os nomes */}
      {menuMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Fechar menu" onClick={() => setMenuMobile(false)} className="absolute inset-0 bg-navy-2/40" />
          <aside className="relative h-full w-72 bg-surface shadow-lg animate-[enter_200ms_var(--ease-out)_both]">{menu("sempre")}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/85 px-4 backdrop-blur-md sm:px-6 lg:px-10">
          <button type="button" onClick={() => setMenuMobile(true)} aria-label="Abrir menu" className="rounded-lg p-1.5 text-foreground hover:bg-surface-2 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setBusca(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-surface-2 px-3.5 text-left text-[13px] text-muted transition-colors hover:border-border-strong hover:text-foreground sm:max-w-md"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate"><span className="sm:hidden">Buscar</span><span className="hidden sm:inline">Buscar cliente, atividade, processo…</span></span>
            <kbd className="hidden rounded-md border border-border bg-surface px-1.5 font-mono text-[10px] text-muted sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <TemaBotao />
            {publicacoesPendentes > 0 && (
              <Link
                href="/admin/publicacoes"
                aria-label={`${publicacoesPendentes} publicações não tratadas`}
                data-tip="Publicações não tratadas"
                className="relative rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Bell className="h-[18px] w-[18px]" />
                <span className="absolute top-0.5 right-0 rounded-full bg-gold px-1 text-[10px] leading-4 font-semibold text-navy-2 tabular-nums">
                  {publicacoesPendentes > 99 ? "99+" : publicacoesPendentes}
                </span>
              </Link>
            )}
            <Link
              href="/admin/mensagens"
              aria-label="Mensagens"
              data-tip="Mensagens e avisos"
              className="relative rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <MessagesSquare className="h-[18px] w-[18px]" />
              {naoLidas > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-gold ring-2 ring-surface" aria-hidden />}
            </Link>
            <Link href="/account" aria-label="Minha conta" className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-gold-2">
              {iniciais(userName) || "MC"}
            </Link>
            <form action={logout} className="hidden sm:block">
              <button type="submit" aria-label="Sair" data-tip="Sair" className="rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </header>

        <main className="flex-1">
          <div key={pathname} className="mx-auto w-full max-w-[1240px] px-4 py-7 animate-page sm:px-6 lg:px-10 lg:py-10">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={busca} onOpenChange={setBusca} items={itensBusca} />
      {/* na tela IA (Ferramentas) o assistente já está aberto em tela grande */}
      {(userRole === "admin" || userRole === "advogado") && permissoes.assistente && pathname !== "/admin/ia" && <Assistente nome={userName.split(" ")[0] ?? ""} />}
      <Suspense fallback={null}>
        <NavTrail />
      </Suspense>
    </div>
    </AtividadeModalProvider>
  );
}
