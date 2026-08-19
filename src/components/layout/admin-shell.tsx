"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/clients", label: "Clientes" },
  { href: "/admin/timesheet", label: "Timesheet" },
  { href: "/admin/activities", label: "Atividades" },
  { href: "/admin/processes", label: "Processos" },
  { href: "/admin/documents", label: "Documentos" },
  { href: "/admin/contracts", label: "Contratos" },
  { href: "/admin/financial", label: "Financeiro" },
  { href: "/admin/reports", label: "Relatórios" },
  { href: "/admin/team", label: "Equipe" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
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
          {NAV_ITEMS.map((item) => {
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
          <p className="text-xs font-medium text-white">Dr. Maurício Cardoso</p>
          <p className="text-xs text-navy-foreground/60">admin</p>
        </div>
      </aside>

      <main className="flex-1 bg-background">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
