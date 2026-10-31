"use client";

import Link from "next/link";
import { useState } from "react";

// Principal → "Marcas por estágio · N no total": rótulo e contador azul por estágio;
// os encerrados (indeferido, arquivado, extinto) ficam escondidos até clicar.

type Linha = { id: string; rotulo: string; cor: string; encerrado: boolean; n: number };

export function MostrarEncerrados({ titulo, estagios, encerrados, semSituacao }: { titulo: string; estagios: Linha[]; encerrados: number; semSituacao: number }) {
  const [ver, setVer] = useState(false);
  const lista = estagios.filter((e) => e.n > 0 && (ver || !e.encerrado));
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground/80">{titulo}</h3>
      <ul className="mt-4 space-y-2.5">
        {lista.map((e) => (
          <li key={e.id}>
            <Link href={`/admin/marcas/processos?estagio=${e.id}`} className="flex items-center justify-between gap-3 text-sm text-foreground hover:underline">
              {e.rotulo}
              <span className="contador-ma min-w-7 rounded px-1.5 py-0.5 text-center text-sm font-semibold tabular-nums">{e.n}</span>
            </Link>
          </li>
        ))}
      </ul>
      {encerrados > 0 && (
        <button type="button" onClick={() => setVer((v) => !v)} className="mt-3 text-sm font-semibold text-navy-3 hover:underline">
          {ver ? "Esconder encerrados" : `Mostrar encerrados (${encerrados})`}
        </button>
      )}
      {semSituacao > 0 && <p className="mt-2 text-xs text-muted">{semSituacao} sem situação informada pelo INPI.</p>}
    </div>
  );
}
