"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { refazerSugestoesAction } from "@/app/admin/painel/actions";

export function RefazerSugestoes({ temSugestao }: { temSugestao: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await refazerSugestoesAction();
            if (r.error) setErro(r.error);
          })
        }
        className="ui-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${pendente ? "animate-spin" : ""}`} aria-hidden />
        {pendente ? "Gerando…" : temSugestao ? "Gerar de novo" : "Gerar agora"}
      </button>
      {erro && <p className="text-xs text-status-danger">{erro}</p>}
    </div>
  );
}
