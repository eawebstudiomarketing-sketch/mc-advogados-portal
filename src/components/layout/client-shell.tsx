"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/logout/actions";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Visão geral" },
  { href: "/dashboard/activities", label: "Atividades" },
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="overflow-hidden rounded-full">
              <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={36} height={36} />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-navy">MC Advogados</p>
              <p className="text-xs text-foreground/50">Portal do cliente</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-foreground">{userName}</p>
              <p className="text-xs text-foreground/50">{clientName}</p>
            </div>
            <Link href="/account" className="text-xs text-foreground/40 hover:text-foreground/70">
              Minha conta
            </Link>
            <form action={logout}>
              <button type="submit" className="text-xs text-foreground/40 hover:text-foreground/70">
                Sair
              </button>
            </form>
          </div>
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 px-6">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "border-navy font-medium text-navy"
                    : "border-transparent text-foreground/50 hover:text-foreground/80"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
