"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** Recarrega as demandas na hora (como um F5, sem recarregar a tela toda). */
export function AtualizarDistribuicao() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" onClick={() => start(() => router.refresh())} disabled={pending} className="ui-btn-secondary">
      <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden /> {pending ? "Atualizando…" : "Atualizar"}
    </button>
  );
}
