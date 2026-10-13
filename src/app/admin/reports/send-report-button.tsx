"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Mail, MailCheck, Loader2 } from "lucide-react";
import { sendReportEmailAction, type SendReportEmailState } from "./actions";

const initialState: SendReportEmailState = { error: null, success: false };

export function SendReportButton({ reportId, alreadySent }: { reportId: string; alreadySent: boolean }) {
  const [state, formAction, pending] = useActionState(sendReportEmailAction, initialState);
  const sent = state.success || alreadySent;

  useEffect(() => {
    if (state.success) toast.success("Relatório enviado por e-mail");
  }, [state.success]);
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  const dica = sent ? "Já enviado por e-mail (enviar de novo)" : "Enviar por e-mail ao cliente";
  return (
    <form action={formAction}>
      <input type="hidden" name="report_id" value={reportId} />
      <button type="submit" disabled={pending} className={`icon-btn ${sent ? "text-status-success" : ""}`} aria-label={dica} data-tip={dica}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : sent ? <MailCheck aria-hidden /> : <Mail aria-hidden />}
      </button>
    </form>
  );
}
