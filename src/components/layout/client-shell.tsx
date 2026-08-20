import Image from "next/image";
import { currentClient } from "@/lib/mock-data";
import { logout } from "@/app/logout/actions";

export function ClientShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName: string;
}) {
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
              <p className="text-xs text-foreground/50">{currentClient.name}</p>
            </div>
            <form action={logout}>
              <button type="submit" className="text-xs text-foreground/40 hover:text-foreground/70">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
