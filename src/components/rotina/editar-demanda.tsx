"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { useAbrirAtividade } from "@/components/atividade/atividade-modal";
import { avisarAtividadeEditadaAction } from "@/app/admin/rotinas/relatorio-actions";

// Botão "Editar" ao lado de cada justificativa no relatório (10/11/2026): abre a
// atividade ali mesmo, já no modo de edição; ao salvar, avisa a responsável.
export function EditarDemanda({ id }: { id: string }) {
  const abrir = useAbrirAtividade();
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() =>
          abrir(id, {
            editar: true,
            aoSalvar: () => {
              setAviso("Salvo");
              avisarAtividadeEditadaAction(id).then((r) => setAviso(r.ok && r.nome ? `Salvo · ${r.nome} foi avisada` : "Salvo"));
            },
          })
        }
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground hover:bg-hover"
      >
        <Pencil className="size-3" aria-hidden /> Editar atividade
      </button>
      {aviso && (
        <span className="inline-flex items-center gap-1 text-xs text-status-success">
          <Check className="size-3" aria-hidden /> {aviso}
        </span>
      )}
    </span>
  );
}
