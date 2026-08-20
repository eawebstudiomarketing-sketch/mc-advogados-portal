"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = { message: null, error: null };

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="overflow-hidden rounded-full">
            <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={56} height={56} priority />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-navy">Esqueci minha senha</h1>
          <p className="mt-1 text-sm text-foreground/50">Informe o e-mail da sua conta</p>
        </div>

        {state.message ? (
          <p className="mt-6 rounded-lg bg-status-success-bg px-3 py-2 text-sm text-status-success">
            {state.message}
          </p>
        ) : (
          <form action={formAction} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground/80">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@email.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
              />
            </div>

            {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
            >
              {pending ? "Enviando..." : "Enviar link de redefinição"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-xs text-foreground/40">
          <Link href="/login" className="hover:text-foreground/60">
            ← Voltar pro login
          </Link>
        </p>
      </div>
    </div>
  );
}
