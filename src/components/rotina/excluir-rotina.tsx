"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { excluirRotinaAction } from "@/app/admin/rotinas/relatorio-actions";

// Excluir a rotina de uma pessoa (só o admin máximo): tira as tarefas fixas e o
// modelo de relatório. Os relatórios já enviados continuam no histórico.

export function ExcluirRotina({ responsavelId, nome }: { responsavelId: string; nome: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function excluir() {
    if (!confirm(`Excluir a rotina de ${nome}? As tarefas fixas e o relatório do dia deixam de aparecer para essa pessoa. Os relatórios já enviados continuam guardados.`)) return;
    start(async () => {
      const r = await excluirRotinaAction(responsavelId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Rotina excluída.");
      router.push("/admin/rotinas", { scroll: false });
    });
  }

  return (
    <button type="button" onClick={excluir} disabled={pending} className="ui-btn-secondary text-status-danger hover:!text-status-danger">
      <Trash2 className="h-4 w-4" aria-hidden /> {pending ? "Excluindo…" : "Excluir rotina"}
    </button>
  );
}
