"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError("Não foi possível redefinir a senha. O link pode ter expirado — solicite um novo.");
      return;
    }

    router.push("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="overflow-hidden rounded-full">
            <Image src="/brand/logo_mc.jpg" alt="MC Advogados" width={56} height={56} priority />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-navy">Definir nova senha</h1>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground/80">
              Nova senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-foreground/80">
              Confirmar senha
            </label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
            />
          </div>

          {error && <p className="text-sm text-status-danger">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
          >
            {pending ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
