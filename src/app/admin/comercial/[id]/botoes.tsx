"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { MessageCircle, UserPlus } from "lucide-react";
import { contatoLeadAction, virarClienteAction } from "../actions";

// Botões da ficha do lead: chamar no Zap (conta como contato) e virar cliente.

export function BotaoZap({ leadId, href }: { leadId: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => void contatoLeadAction(leadId, "whatsapp")} className="inline-flex items-center gap-1.5 rounded-lg bg-zap-bg px-4 py-2 text-sm font-semibold text-zap-ink">
      <MessageCircle className="h-4 w-4" aria-hidden /> Chamar no WhatsApp
    </a>
  );
}

export function VirarCliente({ leadId }: { leadId: string }) {
  const [enviando, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={enviando}
      onClick={() => {
        if (!confirm("Cadastrar este lead como cliente? Ele vai para Fechado e abre a ficha de handoff do cliente novo.")) return;
        iniciar(async () => {
          const r = await virarClienteAction(leadId);
          if (r && !r.ok) toast.error(r.erro);
        });
      }}
      className="ui-btn inline-flex items-center gap-1.5 px-4 py-2 text-sm"
    >
      <UserPlus className="h-4 w-4" aria-hidden /> {enviando ? "Cadastrando…" : "Virar cliente"}
    </button>
  );
}
