"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Clock, Search, Menu, X, LogOut, UserRound, Bell, MessagesSquare } from "lucide-react";
import { logout } from "@/app/logout/actions";
import { CommandPalette, type PaletteItem } from "./command-palette";
import type { Permissoes } from "@/lib/permissoes";
import { secoesVisiveis, rotaAtiva, type Secao } from "./secoes";
import { AbasSecao } from "./abas-secao";
import { NovoMenu, AtalhosMenu } from "./atalhos-topo";
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
  alertaRotina = null,
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
  /** Relógio da rotina: leva à rotina da pessoa e avisa quando há tarefa atrasada ou relatório por enviar. */
  alertaRotina?: { href: string; atrasadas: number; relatorioPendente: boolean } | null;
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

  const secoes = secoesVisiveis(permissoes, superAdmin);
  const secaoAtual = secoes.find((sc) => sc.abas.some((a) => rotaAtiva(pathname, a.href)));

  const itensBusca = useMemo<PaletteItem[]>(
    () => [
      ...secoes.flatMap((sc) => sc.abas.map((i) => ({ href: i.href, label: i.label, group: "Telas", icon: i.icon }))),
      ...clients.map((c) => ({ href: `/admin/clients/${c.id}`, label: c.name, group: "Clientes" })),
      { href: "/account", label: "Minha conta", group: "Conta", icon: UserRound },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- secoes deriva só das permissões
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

  // item do menu = uma seção; leva à primeira tela dela que a pessoa pode ver.
  // O número somado das telas da seção aparece ao lado do nome.
  const itemNav = (secao: Secao) => {
    const on = secao.id === secaoAtual?.id;
    const Icone = secao.icon;
    const n = secao.abas.reduce((soma, a) => soma + badge(a.href), 0);
    return (
      <li key={secao.id}>
        <Link
          href={secao.abas[0].href}
          aria-current={on ? "page" : undefined}
          className={`relative flex h-10 items-center gap-3 rounded-lg px-[11px] text-sm whitespace-nowrap transition-colors duration-150 ${
            on ? "bg-navy/10 text-navy-3" : "text-muted hover:bg-hover hover:text-foreground"
          }`}
        >
          <Icone className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="flex-1 truncate font-medium">{secao.label}</span>
          {n > 0 && (
            <span
              className={`rounded-full px-1.5 text-[10px] leading-4 font-semibold tabular-nums ${on ? "bg-gold text-navy-2" : "bg-navy text-white"}`}
              aria-label={`${n} pendentes`}
            >
              {n > 99 ? "99+" : n}
            </span>
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
        <ul className="space-y-0.5">{secoes.map(itemNav)}</ul>
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
            <NovoMenu permissoes={permissoes} />
            <Suspense fallback={null}>
              <AtalhosMenu />
            </Suspense>
            <TemaBotao />
            {alertaRotina && (
              <Link
                href={alertaRotina.href}
                aria-label={alertaRotina.atrasadas || alertaRotina.relatorioPendente ? `Sua rotina: ${[alertaRotina.atrasadas ? `${alertaRotina.atrasadas} tarefa(s) atrasada(s)` : "", alertaRotina.relatorioPendente ? "relatório por enviar" : ""].filter(Boolean).join(" e ")}` : "Sua rotina"}
                data-tip={alertaRotina.atrasadas || alertaRotina.relatorioPendente ? "Sua rotina precisa de você" : "Sua rotina"}
                className="relative rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Clock className="h-[18px] w-[18px]" />
                {(alertaRotina.atrasadas > 0 || alertaRotina.relatorioPendente) && <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-status-danger ring-2 ring-surface" aria-hidden />}
              </Link>
            )}
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
            {secaoAtual && <AbasSecao secao={secaoAtual} pathname={pathname} badge={badge} />}
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
