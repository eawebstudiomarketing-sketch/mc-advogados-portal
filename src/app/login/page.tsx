import Image from "next/image";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="overflow-hidden rounded-full">
            <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={56} height={56} priority />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-navy">MC Advogados Portal</h1>
          <p className="mt-1 text-sm text-foreground/50">Acesse com seu e-mail e senha</p>
        </div>

        <form className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground/80">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@email.com"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground/80">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90"
          >
            Entrar
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-foreground/40">
          Esqueceu a senha? Fale com a equipe MC Advogados.
        </p>
      </div>
    </div>
  );
}
