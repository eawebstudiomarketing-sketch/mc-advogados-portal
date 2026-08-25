"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/logout/actions";

const ROLE_LABEL: Record<string, string> = {
  admin: "admin",
  advogado: "advogado",
};

const NAV_ITEMS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/clients", label: "Clientes", adminOnly: true },
  { href: "/admin/activities", label: "Atividades" },
  { href: "/admin/processes", label: "Processos" },
  { href: "/admin/documents", label: "Documentos" },
  { href: "/admin/contracts", label: "Contratos" },
  // Financeiro/Relatórios/Equipe são admin-only (páginas já bloqueiam
  // advogado via requireRole) — filtrados abaixo, não faz sentido mostrar
  // um link que sempre bate num "acesso negado".
  { href: "/admin/financial", label: "Financeiro", adminOnly: true },
  { href: "/admin/reports", label: "Relatórios", adminOnly: true },
  { href: "/admin/team", label: "Equipe", adminOnly: true },
];

export function AdminShell({
  children,
  userName,
  userRole,
}: {
  children: React.ReactNode;
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col bg-navy text-navy-foreground">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="overflow-hidden rounded-full">
            <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={36} height={36} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">MC Advogados</p>
            <p className="text-xs text-navy-foreground/60">Painel administrativo</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.filter((item) => !item.adminOnly || userRole === "admin").map((item) => {
            const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-white/10 font-medium text-white"
                    : "text-navy-foreground/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-xs font-medium text-white">{userName}</p>
          <p className="text-xs text-navy-foreground/60">{ROLE_LABEL[userRole] ?? userRole}</p>
          <div className="mt-2 flex items-center gap-3">
            <Link href="/account" className="text-xs text-navy-foreground/60 hover:text-white">
              Minha conta
            </Link>
            <form action={logout}>
              <button type="submit" className="text-xs text-navy-foreground/60 hover:text-white">
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-background">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
