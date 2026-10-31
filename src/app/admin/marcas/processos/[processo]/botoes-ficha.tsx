"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Printer, Settings2, Trash2 } from "lucide-react";
import { desacompanharAction } from "../../actions";

/** Botões da ficha, na ordem do Marca Acompanhada: Descadastrar, Configurar, Imprimir (Ctrl+P = PDF do cliente), Voltar. */
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
        className="ui-btn-secondary justify-center text-status-danger"
      >
        <Trash2 className="h-4 w-4" aria-hidden /> Descadastrar marca
      </button>
      <Link href={`/admin/marcas/configurar?processo=${processo}`} className="ui-btn-secondary justify-center">
        <Settings2 className="h-4 w-4" aria-hidden /> Configurar acompanhamento
      </Link>
      <button type="button" onClick={() => window.print()} className="ui-btn justify-center">
        <Printer className="h-4 w-4" aria-hidden /> Imprimir
      </button>
      <button type="button" onClick={() => router.back()} className="ui-btn-secondary justify-center">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
      </button>
    </>
  );
}
