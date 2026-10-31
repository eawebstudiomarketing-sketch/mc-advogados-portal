"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { desacompanharAction } from "../actions";

/** Patentes acompanhadas → Desacompanhar. */
export function BotaoDesacompanhar({ processo, nome }: { processo: string; nome: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Desacompanhar ${nome}? Ela sai da carteira e para de receber avisos.`)) return;
        start(async () => {
          const r = await desacompanharAction(processo);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Patente desacompanhada");
          router.refresh();
        });
      }}
      className="text-status-danger hover:underline"
    >
      Desacompanhar
    </button>
  );
}
