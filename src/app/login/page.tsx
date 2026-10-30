"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="email" className="ui-label">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@email.com"
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="password" className="ui-label">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className="ui-input"
        />
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}
      {!state.error && searchParams.get("erro") === "desativado" && (
        <p className="text-sm text-status-danger">Seu acesso ao portal foi desativado. Fale com o administrador.</p>
      )}
      {!state.error && searchParams.get("erro") === "sem-perfil" && (
        <p className="text-sm text-status-danger">Seu acesso ao portal não está ativo. Fale com o escritório para receber um novo convite.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

// Login em duas metades (como o do Astrea): arte da marca à esquerda, cartão de entrada à direita.
// O formulário, as regras de senha e os avisos de acesso são os mesmos de sempre.
export default function LoginPage() {
  return (
    <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-2 text-white lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-[560px] w-[560px] rounded-full border border-gold/15" />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-[380px] w-[380px] rounded-full border border-gold/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 h-[480px] w-[480px] rounded-full border border-gold/10" />
        <div className="relative flex items-center gap-3">
          <div className="overflow-hidden rounded-full ring-1 ring-gold/50">
            <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={48} height={48} priority />
          </div>
          <div className="leading-tight">
            <p className="text-[12px] font-semibold tracking-[0.2em] text-gold-2">MAURÍCIO CARDOSO</p>
            <p className="text-lg font-semibold tracking-[0.08em]">ADVOCACIA</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="text-[12px] font-semibold tracking-[0.2em] text-gold-2">PORTAL DO ESCRITÓRIO</p>
          <h2 className="mt-3 text-4xl leading-tight font-semibold tracking-tight text-balance">Seu escritório inteiro, num só lugar.</h2>
          <p className="mt-4 text-base leading-relaxed text-white/80">Agenda, rotinas, processos, publicações e clientes, com o WhatsApp e a IA ao lado de quem trabalha.</p>
        </div>
        <p className="relative text-sm text-white/60">mcadvogados.app.br</p>
      </aside>

      <main className="flex min-h-screen items-center justify-center bg-surface-2 px-5 py-10">
        <div className="w-full max-w-sm animate-enter">
          <div className="mb-6 flex items-center justify-center gap-3 text-foreground lg:hidden">
            <div className="overflow-hidden rounded-full ring-1 ring-gold/50">
              <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={44} height={44} priority />
            </div>
            <div className="leading-tight">
              <p className="text-[12px] font-semibold tracking-[0.2em] text-gold-ink">MAURÍCIO CARDOSO</p>
              <p className="text-lg font-semibold tracking-[0.08em]">ADVOCACIA</p>
            </div>
          </div>
          <div className="w-full rounded-2xl bg-surface p-7 shadow-lg">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">Entrar no portal</h1>
              <p className="mt-1 text-sm text-muted">Use seu e-mail e senha.</p>
            </div>

            <Suspense fallback={<div className="mt-6 h-[188px]" />}>
              <LoginForm />
            </Suspense>

            <p className="mt-5 text-center text-xs text-muted">
              <Link href="/forgot-password" className="underline-offset-2 hover:text-foreground hover:underline">
                Esqueci minha senha
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
