"use client";

import { useActionState } from "react";
import { sendReminderAction, type SendReminderState } from "./actions";

const initialState: SendReminderState = { error: null, success: false };

export function ReminderButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(sendReminderAction, initialState);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending || state.success} className="text-xs font-medium text-navy hover:underline disabled:opacity-60">
        {state.success ? "Lembrete enviado" : pending ? "Enviando..." : "Enviar lembrete"}
      </button>
      {state.error && <p className="text-right text-xs text-status-danger">{state.error}</p>}
    </form>
  );
}
