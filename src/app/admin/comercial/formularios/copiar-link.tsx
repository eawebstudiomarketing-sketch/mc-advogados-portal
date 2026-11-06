"use client";

import { toast } from "sonner";
import { Link2 } from "lucide-react";

export function CopiarLink({ link, rotulo = "Copiar link" }: { link: string; rotulo?: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(link).then(
          () => toast.success("Link copiado. Para anúncio, acrescente ?utm_source=instagram&utm_campaign=nome-da-campanha"),
          () => toast.error("Não consegui copiar."),
        )
      }
      className="ui-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
    >
      <Link2 className="h-3.5 w-3.5" aria-hidden /> {rotulo}
    </button>
  );
}
