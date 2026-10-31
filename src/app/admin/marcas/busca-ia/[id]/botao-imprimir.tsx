"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

/** Gerar PDF = imprimir a página (Ctrl+P). Com ?imprimir=1 (link "PDF" do histórico) abre a impressão sozinho. */
export function BotaoImprimir({ automatico }: { automatico: boolean }) {
  useEffect(() => {
    if (automatico) setTimeout(() => window.print(), 400);
  }, [automatico]);
  return (
    <button type="button" onClick={() => window.print()} className="ui-btn print:hidden">
      <Printer className="h-4 w-4" aria-hidden /> Gerar PDF
    </button>
  );
}
