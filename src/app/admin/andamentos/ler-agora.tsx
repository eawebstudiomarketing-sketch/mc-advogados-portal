"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { lerAndamentosAgoraAction, type LerAgoraState } from "./actions";

const inicial: LerAgoraState = { msg: null, erro: false };

export function LerAgora() {
  const [state, action, pending] = useActionState(lerAndamentosAgoraAction, inicial);
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <button type="submit" disabled={pending} className="ui-btn">
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
        {pending ? "Lendo andamentos…" : "Ler agora"}
      </button>
      {state.msg && <p className={`max-w-sm text-right text-xs ${state.erro ? "text-status-danger" : "text-muted"}`}>{state.msg}</p>}
    </form>
  );
}
