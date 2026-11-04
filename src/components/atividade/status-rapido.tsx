"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { statusRapidoAction } from "@/app/admin/activities/status-rapido-actions";

// Botões de status em qualquer lista de atividades (04/11/2026): ▶ Em andamento e
// ✓ Concluir. Concluída some da agenda; dá para desfazer no aviso.

export function StatusRapido({ id, status = "aberta", compacto = false }: { id: string; status?: string; compacto?: boolean }) {
  const router = useRouter();
  const [atual, setAtual] = useState(status);
  const [pending, start] = useTransition();
  if (atual === "concluida" || atual === "cancelada") return null;

  function mudar(novo: "em_andamento" | "concluida" | "aberta", aviso?: string) {
    const antes = atual;
    setAtual(novo);
    start(async () => {
      const r = await statusRapidoAction(id, novo);
      if (!r.ok) {
        setAtual(antes);
        return void toast.error("Não foi possível mudar o status.");
      }
      if (aviso)
        toast.success(aviso, novo === "concluida" ? { action: { label: "Desfazer", onClick: () => void statusRapidoAction(id, antes as "aberta").then(() => router.refresh()) } } : undefined);
      router.refresh();
    });
  }

  const btn = `icon-btn ${compacto ? "!h-7 !w-7" : "!h-8 !w-8"} shrink-0`;
  return (
    <span className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden />
      ) : atual === "em_andamento" ? (
        <button type="button" onClick={() => mudar("aberta")} className={`${btn} text-status-info`} aria-label="Voltar para aberta" data-tip="Em andamento (clique para voltar)">
          <Undo2 aria-hidden />
        </button>
      ) : (
        <button type="button" onClick={() => mudar("em_andamento", "Atividade em andamento.")} className={btn} aria-label="Marcar em andamento" data-tip="Em andamento">
          <Play aria-hidden />
        </button>
      )}
      {!pending && (
        <button type="button" onClick={() => mudar("concluida", "Atividade concluída: saiu da agenda.")} className={`${btn} hover:!text-status-success`} aria-label="Concluir atividade" data-tip="Concluir">
          <Check aria-hidden />
        </button>
      )}
    </span>
  );
}
