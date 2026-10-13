import Image from "next/image";
import Link from "next/link";

// Casca das páginas públicas (sem login): /sobre e /privacidade. O Google exige
// uma página inicial e uma política de privacidade públicas para publicar o
// app de OAuth da integração com o Google Drive.
export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center gap-3">
          <div className="overflow-hidden rounded-full">
            <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={48} height={48} priority />
          </div>
          <div>
            <p className="section-title">MC Advogados Portal</p>
            <p className="text-xs text-muted">Maurício Cardoso Advocacia</p>
          </div>
        </header>

        <main className="mt-8 rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-navy">{title}</h1>
          {updatedAt && <p className="mt-1 text-xs text-muted">Última atualização: {updatedAt}</p>}
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-foreground/80">{children}</div>
        </main>

        <footer className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
          <Link href="/sobre" className="hover:text-foreground/70">
            Sobre o portal
          </Link>
          <Link href="/privacidade" className="hover:text-foreground/70">
            Política de Privacidade
          </Link>
          <Link href="/login" className="hover:text-foreground/70">
            Entrar
          </Link>
        </footer>
      </div>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="pt-2 text-base font-semibold text-navy">{title}</h2>
      {children}
    </section>
  );
}
