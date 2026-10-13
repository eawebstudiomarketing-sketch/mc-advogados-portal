"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [supabase] = useState(() => createClient());
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  // O link do e-mail traz o token de recuperação no hash da URL — o
  // client do Supabase processa isso de forma assíncrona ao montar e
  // dispara o evento PASSWORD_RECOVERY quando a sessão fica pronta. Só
  // depois disso dá pra chamar updateUser com sucesso.
  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.subscription.unsubscribe();
  }, [supabase]);

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

        {!ready ? (
          <p className="mt-6 text-center text-sm text-muted">Validando o link...</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="password" className="ui-label">
                Nova senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="ui-input"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="ui-label">
                Confirmar senha
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="ui-input"
              />
            </div>

            {error && <p className="text-sm text-status-danger">{error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="ui-btn w-full py-2.5"
            >
              {pending ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
