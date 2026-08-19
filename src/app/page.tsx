import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-navy px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="overflow-hidden rounded-full">
          <Image
            src="/brand/logo_mc.jpg"
            alt="MC Advogados"
            width={96}
            height={96}
            priority
          />
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-navy-foreground">
          MC Advogados Portal
        </h1>

        <div className="mt-3 h-px w-12 bg-gold" />

        <p className="mt-4 text-sm text-navy-foreground/70">
          Prévia de telas com dados fictícios — autenticação real ainda não conectada.
        </p>

        <div className="mt-8 flex w-full flex-col gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-gold-foreground transition-colors hover:opacity-90"
          >
            Tela de login
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-white/10"
          >
            Ver dashboard do cliente
          </Link>
          <Link
            href="/admin"
            className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-white/10"
          >
            Ver painel administrativo
          </Link>
        </div>
      </div>
    </div>
  );
}
