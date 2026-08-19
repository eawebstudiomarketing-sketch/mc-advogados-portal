import Image from "next/image";
import { currentClient } from "@/lib/mock-data";

export function ClientShell({ children }: { children: React.ReactNode }) {
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

          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-foreground">{currentClient.name}</p>
            <p className="text-xs text-foreground/50">{currentClient.plano}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
