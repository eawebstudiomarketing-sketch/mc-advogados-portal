"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restaurarAtividadeAction } from "./actions";

export function RestaurarAtividade({ id }: { id: string }) {
  const router = useRouter();
  const [pendente, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          start(async () => {
            const r = await restaurarAtividadeAction(id);
            setMsg(r.error ? { text: r.error, ok: false } : { text: "Restaurada.", ok: true });
            if (!r.error) router.refresh();
          })
        }
        className="ui-btn px-3 py-1.5 text-xs"
      >
        {pendente ? "Restaurando…" : "Restaurar"}
      </button>
      {msg && <p className={`text-xs ${msg.ok ? "text-status-success" : "text-status-danger"}`}>{msg.text}</p>}
    </div>
  );
}
