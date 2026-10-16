"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { mudarStatusDistribuicaoAction } from "./actions";

// Seleção em massa: as caixinhas ficam nos cartões e apontam para este
// formulário (atributo form="distribuicao-lote").
const SELETOR = 'input[name="id-lote"][form="distribuicao-lote"]';

export function LoteDistribuicao({ total }: { total: number }) {
  const [marcadas, setMarcadas] = useState(0);
  const [disponiveis, setDisponiveis] = useState(0);

  useEffect(() => {
    const caixas = () => Array.from(document.querySelectorAll<HTMLInputElement>(SELETOR));
    const contar = () => {
      setDisponiveis(caixas().length);
      setMarcadas(caixas().filter((c) => c.checked).length);
    };
    contar();
    document.addEventListener("change", contar);
    return () => document.removeEventListener("change", contar);
  }, [total]);

  const todas = disponiveis > 0 && marcadas === disponiveis;
  return (
    <form id="distribuicao-lote" action={mudarStatusDistribuicaoAction} className="mb-3 flex min-h-9 flex-wrap items-center gap-2">
      <input type="hidden" name="status" value="descartada" />
      {disponiveis > 0 ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={todas}
            onChange={() => {
              document.querySelectorAll<HTMLInputElement>(SELETOR).forEach((c) => (c.checked = !todas));
              setMarcadas(todas ? 0 : disponiveis);
            }}
            className="h-4 w-4 accent-navy"
          />
          {marcadas ? `${marcadas} selecionada(s)` : `${total} demanda(s)`}
        </label>
      ) : (
        <span className="text-xs text-muted">{total} demanda(s)</span>
      )}
      {marcadas > 0 && (
        <button type="submit" className="ui-btn-secondary px-3 py-1.5 text-xs">
          <X className="h-3.5 w-3.5" aria-hidden /> Descartar selecionadas
        </button>
      )}
    </form>
  );
}
