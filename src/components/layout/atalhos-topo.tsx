"use client";

import { LinkMenu as Link } from "./link-menu";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, FileSignature, FileText, Gavel, ListChecks, Plus, Star, Users, Wallet, Clock, X, type LucideIcon } from "lucide-react";
import type { Permissoes, PermChave } from "@/lib/permissoes";
import { alternarFavorito, atalhosStore, lerAtalhos, registrarRecente, tipoDaFicha, type Atalho } from "@/lib/atalhos";

// Botões do cabeçalho (itens 2 e 3 da auditoria, 30/10/2026): "+ Novo" cria
// qualquer coisa de qualquer tela; a estrela guarda Favoritos e mostra as
// fichas abertas por último (Recentes).

const NOVOS: { href: string; rotulo: string; icon: LucideIcon; perm: PermChave }[] = [
  { href: "/admin/activities/new", rotulo: "Atividade", icon: ListChecks, perm: "atividades" },
  { href: "/admin/agenda/compromisso/novo", rotulo: "Compromisso", icon: CalendarDays, perm: "agenda" },
  { href: "/admin/clients/new", rotulo: "Cliente (empresa)", icon: Users, perm: "clientes" },
  { href: "/admin/clients/new?tipo=PF", rotulo: "Cliente (pessoa)", icon: Users, perm: "clientes_pf" },
  { href: "/admin/processes/new", rotulo: "Processo", icon: Gavel, perm: "processos" },
  { href: "/admin/contracts/new", rotulo: "Contrato", icon: FileSignature, perm: "contratos" },
  { href: "/admin/documents/new", rotulo: "Documento", icon: FileText, perm: "documentos" },
  { href: "/admin/financial/new", rotulo: "Lançamento financeiro", icon: Wallet, perm: "financeiro" },
];

const BOTAO = "relative rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground";
const MENU = "absolute top-[calc(100%+8px)] right-0 z-50 w-72 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_40px_-12px_rgba(15,26,42,0.25)] animate-[enter_160ms_var(--ease-out)_both]";

function useMenu() {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [rota, setRota] = useState(pathname);
  if (rota !== pathname) {
    setRota(pathname);
    setAberto(false);
  }
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);
  return { aberto, setAberto, caixa };
}

export function NovoMenu({ permissoes }: { permissoes: Permissoes }) {
  const { aberto, setAberto, caixa } = useMenu();
  const itens = NOVOS.filter((n) => permissoes[n.perm]);
  if (!itens.length) return null;
  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-navy pr-3.5 pl-3 text-[13px] font-semibold text-white transition-colors hover:bg-navy-2"
      >
        <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Novo</span>
        <span className="sr-only sm:hidden">Novo</span>
      </button>
      {aberto && (
        <div className={MENU}>
          <p className="eyebrow border-b border-border px-3.5 py-2">Criar</p>
          <ul role="menu" className="p-1.5">
            {itens.map((n) => (
              <li key={n.href}>
                <Link href={n.href} role="menuitem" className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-foreground/90 hover:bg-surface-2">
                  <n.icon className="h-4 w-4 text-muted" aria-hidden />
                  {n.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Nome da tela aberta = o título grande da página (o h1 dentro do main). */
const tituloDaTela = () => document.querySelector("main h1")?.textContent?.trim() ?? "";

export function AtalhosMenu() {
  const { aberto, setAberto, caixa } = useMenu();
  const pathname = usePathname();
  const params = useSearchParams();
  const cru = useSyncExternalStore(atalhosStore.assinar, atalhosStore.foto, atalhosStore.fotoServidor);
  const { favoritos, recentes } = lerAtalhos(cru);
  // a ficha atual entra em Recentes depois que a página desenha o título
  useEffect(() => {
    const tipo = tipoDaFicha(pathname);
    if (!tipo) return;
    const t = setTimeout(() => {
      const nome = tituloDaTela();
      if (nome) registrarRecente({ href: pathname, nome, tipo });
    }, 400);
    return () => clearTimeout(t);
  }, [pathname]);

  const qs = params.toString();
  const hrefAtual = qs ? `${pathname}?${qs}` : pathname;
  const favoritada = favoritos.some((f) => f.href === hrefAtual);

  const linha = (a: Atalho, removivel: boolean) => {
    const Icone = a.tipo === "cliente" ? Users : a.tipo === "processo" ? Gavel : Star;
    return (
      <li key={a.href} className="group/at flex items-center rounded-xl hover:bg-surface-2">
        <Link href={a.href} role="menuitem" className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-sm text-foreground/90">
          <Icone className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span className="truncate">{a.nome}</span>
        </Link>
        {removivel && (
          <button
            type="button"
            onClick={() => alternarFavorito(a)}
            aria-label={`Tirar ${a.nome} dos favoritos`}
            className="mr-1 rounded-lg p-1.5 text-muted opacity-0 group-hover/at:opacity-100 hover:text-foreground focus-visible:opacity-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </li>
    );
  };

  return (
    <div ref={caixa} className="relative">
      <button type="button" onClick={() => setAberto((a) => !a)} aria-haspopup="menu" aria-expanded={aberto} aria-label="Favoritos e recentes" data-tip="Favoritos e recentes" className={BOTAO}>
        <Star className={`h-[18px] w-[18px] ${favoritada ? "fill-gold text-gold" : ""}`} />
      </button>
      {aberto && (
        <div className={MENU}>
          <div className="border-b border-border p-1.5">
            <button
              type="button"
              onClick={() => {
                const nome = tituloDaTela() || "Tela";
                const tipo = tipoDaFicha(pathname) ?? "tela";
                alternarFavorito({ href: hrefAtual, nome, tipo });
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-foreground hover:bg-surface-2"
            >
              <Star className={`h-4 w-4 ${favoritada ? "fill-gold text-gold" : "text-muted"}`} aria-hidden />
              {favoritada ? "Tirar esta tela dos favoritos" : "Favoritar esta tela"}
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            <p className="eyebrow px-3.5 pt-2.5 pb-1">Favoritos</p>
            {favoritos.length ? (
              <ul role="menu" className="px-1.5 pb-1.5">{favoritos.map((f) => linha(f, true))}</ul>
            ) : (
              <p className="px-3.5 pb-2.5 text-xs text-muted">Abra um cliente, processo ou tela e clique em &quot;Favoritar esta tela&quot;.</p>
            )}
            <p className="eyebrow flex items-center gap-1.5 border-t border-border px-3.5 pt-2.5 pb-1">
              <Clock className="h-3 w-3" aria-hidden /> Abertos por último
            </p>
            {recentes.length ? (
              <ul role="menu" className="px-1.5 pb-1.5">{recentes.map((r) => linha(r, false))}</ul>
            ) : (
              <p className="px-3.5 pb-2.5 text-xs text-muted">As fichas de cliente e processo que você abrir aparecem aqui.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
