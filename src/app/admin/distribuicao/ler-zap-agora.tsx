"use client";

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { lerZapAgoraAction } from "./actions";

/** Só admin: lê agora as mensagens novas dos grupos/contatos de clientes. */
export function LerZapAgora() {
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await lerZapAgoraAction();
            setMsg({ texto: r.mensagem, ok: r.ok });
          })
        }
        className="ui-btn"
      >
        <MessageCircle className={`h-4 w-4 ${pending ? "animate-pulse" : ""}`} aria-hidden />
        {pending ? "Lendo o WhatsApp…" : "Ler WhatsApp agora"}
      </button>
      {msg && <p className={`max-w-sm text-right text-xs ${msg.ok ? "text-muted" : "text-status-danger"}`}>{msg.texto}</p>}
    </div>
  );
}
