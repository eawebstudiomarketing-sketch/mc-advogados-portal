"use client";

import { Printer } from "lucide-react";

// "Gerar PDF" do manual: abre a impressão do navegador (Salvar como PDF).
export function ImprimirManual() {
  return (
    <button type="button" onClick={() => window.print()} className="ui-btn inline-flex items-center gap-1.5 print:hidden">
      <Printer className="h-4 w-4" aria-hidden /> Gerar PDF
    </button>
  );
}
