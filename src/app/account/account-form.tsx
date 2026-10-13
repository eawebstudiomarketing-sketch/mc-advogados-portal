"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function AccountForm() {
  const [supabase] = useState(() => createClient());
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

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
      setError("Não foi possível trocar a senha. Tente novamente.");
      return;
    }

    setPassword("");
    setConfirm("");
    setSuccess(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 ui-card p-6">
      <h2 className="section-title">Trocar senha</h2>

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
          Confirmar nova senha
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
      {success && <p className="text-sm text-status-success">Senha atualizada com sucesso.</p>}

      <button
        type="submit"
        disabled={pending}
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
