"use client";

import { useState } from "react";

// Ficha → "+ Mostrar especificação" (fechada, como no Marca Acompanhada). Na impressão sai sempre aberta.
export function MostrarEspecificacao({ texto }: { texto: string }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberta((a) => !a)} className="mt-1 text-sm text-navy-3 hover:underline print:hidden">
        {aberta ? "− Esconder especificação" : "+ Mostrar especificação"}
      </button>
      <p className={`mt-1 text-sm ${aberta ? "" : "hidden print:block"}`}>Especificação: {texto}</p>
    </>
  );
}
