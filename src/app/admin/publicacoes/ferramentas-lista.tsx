"use client";

import { useEffect, useState } from "react";
import { CheckCheck, ChevronsDownUp, ChevronsUpDown, X } from "lucide-react";
import { mudarStatusEmLoteAction } from "./actions";

// Barra acima da lista: expandir/recolher todas e ações em massa. As caixinhas
// ficam em cada cartão e apontam para o formulário daqui (atributo form=).
const SELETOR = 'input[name="ids"][form="publicacoes-lote"]';

export function FerramentasLista({ total, selecionavel }: { total: number; selecionavel: boolean }) {
  const [expandido, setExpandido] = useState(false);
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

  const alternarTexto = () => {
    const abrir = !expandido;
    document.querySelectorAll<HTMLDetailsElement>("details[data-publicacao-texto]").forEach((d) => (d.open = abrir));
    setExpandido(abrir);
  };

  const todas = disponiveis > 0 && marcadas === disponiveis;
  const marcarTodas = () => {
    const valor = !todas;
    document.querySelectorAll<HTMLInputElement>(SELETOR).forEach((c) => (c.checked = valor));
    setMarcadas(valor ? disponiveis : 0);
  };

  return (
    <div className="mb-3 flex min-h-8 flex-wrap items-center gap-2">
      {selecionavel && disponiveis > 0 ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={todas} onChange={marcarTodas} className="h-4 w-4 accent-navy" />
          {marcadas ? `${marcadas} selecionada${marcadas > 1 ? "s" : ""}` : `${total} ${total === 1 ? "publicação" : "publicações"}`}
        </label>
      ) : (
        <span className="text-xs text-muted">
          {total} {total === 1 ? "publicação" : "publicações"}
        </span>
      )}

      <form id="publicacoes-lote" action={mudarStatusEmLoteAction} className="flex items-center gap-2">
        {marcadas > 0 && (
          <>
            <button type="submit" name="status" value="tratada" className="ui-btn-secondary px-3 py-1.5 text-xs">
              <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Marcar como tratadas
            </button>
            <button type="submit" name="status" value="descartada" className="ui-btn-secondary px-3 py-1.5 text-xs">
              <X className="h-3.5 w-3.5" aria-hidden /> Descartar
            </button>
          </>
        )}
      </form>

      {total > 0 && (
        <button type="button" onClick={alternarTexto} className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-navy-3 hover:underline">
          {expandido ? <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />}
          {expandido ? "Recolher todas" : "Expandir todas"}
        </button>
      )}
    </div>
  );
}
