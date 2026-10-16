"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { enviarRotinaAgoraAction } from "./actions";

/** Escolher de quem é o dia (admin ou quem tem a permissão). */
export function SeletorPessoa({ pessoas, atual, dia }: { pessoas: { id: string; nome: string }[]; atual: string | null; dia: string }) {
  const router = useRouter();
  return (
    <select
      value={atual ?? ""}
      onChange={(e) => router.push(`/admin/agenda?aba=dia&dia=${dia}&pessoa=${e.target.value}`)}
      aria-label="De quem é o dia"
      className="ui-input w-auto py-1.5 text-sm"
    >
      {pessoas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </select>
  );
}

/** Só admin: manda a rotina de hoje desta pessoa no WhatsApp agora. */
export function EnviarRotinaAgora({ pessoaId }: { pessoaId: string }) {
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await enviarRotinaAgoraAction(pessoaId);
            setMsg({ texto: r.mensagem, ok: r.ok });
          })
        }
        className="ui-btn-secondary px-3 py-1.5 text-xs"
      >
        <Send className="h-3.5 w-3.5" aria-hidden /> {pending ? "Enviando…" : "Mandar no WhatsApp agora"}
      </button>
      {msg && <p className={`max-w-xs text-right text-xs ${msg.ok ? "text-muted" : "text-status-danger"}`}>{msg.texto}</p>}
    </div>
  );
}
