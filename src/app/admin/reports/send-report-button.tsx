"use client";

import { useActionState } from "react";
import { sendReportEmailAction, type SendReportEmailState } from "./actions";

const initialState: SendReportEmailState = { error: null, success: false };

export function SendReportButton({ reportId, alreadySent }: { reportId: string; alreadySent: boolean }) {
  const [state, formAction, pending] = useActionState(sendReportEmailAction, initialState);
  const sent = state.success || alreadySent;

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="report_id" value={reportId} />
      <button type="submit" disabled={pending || sent} className="text-xs font-medium text-navy hover:underline disabled:opacity-60">
        {sent ? "Enviado" : pending ? "Enviando..." : "Enviar por e-mail"}
      </button>
      {state.error && <p className="text-right text-xs text-status-danger">{state.error}</p>}
    </form>
  );
}
