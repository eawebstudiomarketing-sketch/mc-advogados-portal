"use client";

import { useActionState } from "react";
import { inviteClientPortalUserAction } from "@/app/admin/team/actions";
import type { InviteUserState } from "@/app/admin/team/actions";

const initialState: InviteUserState = { error: null };

export function PortalAccessInvite({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(inviteClientPortalUserAction, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          name="full_name"
          type="text"
          placeholder="Nome do contato"
          required
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
        <input
          name="email"
          type="email"
          placeholder="E-mail do contato"
          required
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>
      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="ui-btn-secondary px-3 py-1.5 text-xs"
      >
        {pending ? "Enviando..." : "Convidar pro portal"}
      </button>
    </form>
  );
}
