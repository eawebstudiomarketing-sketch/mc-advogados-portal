"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Printer, Trash2 } from "lucide-react";
import { desacompanharAction } from "../../actions";

/** Botões da ficha: Descadastrar marca e Imprimir. */
export function BotoesFicha({ processo, nome }: { processo: string; nome: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Descadastrar ${nome} (${processo})? Ela sai da carteira e para de receber avisos.`)) return;
          start(async () => {
            const r = await desacompanharAction(processo);
            if (!r.ok) return void toast.error(r.error);
            toast.success(`${nome} descadastrada`);
            router.push("/admin/marcas/processos");
          });
        }}
        className="ui-btn-secondary text-status-danger"
      >
        <Trash2 className="h-4 w-4" aria-hidden /> Descadastrar marca
      </button>
      <button type="button" onClick={() => window.print()} className="ui-btn-secondary">
        <Printer className="h-4 w-4" aria-hidden /> Imprimir
      </button>
    </>
  );
}
