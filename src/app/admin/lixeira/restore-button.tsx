"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RestoreButton({ batchId, count }: { batchId: string; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function restore() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/lixeira/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; restored?: number; skipped?: number; relinked?: boolean };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível restaurar.");
      const extra = [j.relinked && "pasta ligada de novo", j.skipped && `${j.skipped} não puderam voltar (cliente excluído ou já estavam no portal)`].filter(Boolean).join("; ");
      setMsg({ text: `${j.restored} documento(s) restaurado(s)${extra ? ` — ${extra}` : ""}.`, ok: true });
      router.refresh();
    } catch (e) {
      setMsg({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={restore}
        className="ui-btn px-3 py-1.5 text-xs"
      >
        {busy ? "Restaurando…" : count > 1 ? `Restaurar os ${count}` : "Restaurar"}
      </button>
      {msg && <p className={`text-xs ${msg.ok ? "text-status-success" : "text-status-danger"}`}>{msg.text}</p>}
    </div>
  );
}
