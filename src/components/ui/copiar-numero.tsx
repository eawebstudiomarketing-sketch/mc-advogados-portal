"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Número do processo em destaque, com botão de copiar. */
export function CopiarNumero({ numero, className = "" }: { numero: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(numero);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {}
  };
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold text-foreground tabular-nums ${className}`}>
      {numero}
      <button type="button" onClick={copiar} className="icon-btn" title={copiado ? "Copiado" : "Copiar o número"} aria-label="Copiar o número do processo">
        {copiado ? <Check className="size-3.5 text-status-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}
