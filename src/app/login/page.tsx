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

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-navy-2 px-5">
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full border border-gold/15" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full border border-gold/10" />
      <div className="relative w-full max-w-sm animate-enter">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <div className="overflow-hidden rounded-full ring-1 ring-gold/50">
            <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={44} height={44} priority />
          </div>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-gold-2">MAURÍCIO CARDOSO</p>
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
    </div>
  );
}
