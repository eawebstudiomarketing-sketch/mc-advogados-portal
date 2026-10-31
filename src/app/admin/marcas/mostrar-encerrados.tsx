"use client";

import Link from "next/link";
import { useState } from "react";

// Principal → "Marcas por estágio": barras por estágio; os encerrados
// (indeferido, arquivado, extinto) ficam escondidos até clicar.

type Linha = { id: string; rotulo: string; cor: string; encerrado: boolean; n: number };

export function MostrarEncerrados({ titulo, estagios, encerrados, semSituacao }: { titulo: string; estagios: Linha[]; encerrados: number; semSituacao: number }) {
  const [ver, setVer] = useState(false);
  const total = estagios.reduce((s, e) => s + e.n, 0) || 1;
  const lista = estagios.filter((e) => (ver || !e.encerrado) && (e.n > 0 || !e.encerrado));
  return (
    <div>
      <h2 className="section-title">{titulo}</h2>
      <ul className="mt-3 space-y-2">
        {lista.map((e) => (
          <li key={e.id}>
            <Link href={`/admin/marcas/processos?estagio=${e.id}`} className="group flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 text-foreground/85 group-hover:underline">{e.rotulo}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-track">
                <span className={`block h-full rounded-full ${e.cor}`} style={{ width: `${(e.n / total) * 100}%` }} />
              </span>
              <span className="w-8 text-right font-semibold tabular-nums">{e.n}</span>
            </Link>
          </li>
        ))}
      </ul>
      {encerrados > 0 && (
        <button type="button" onClick={() => setVer((v) => !v)} className="ui-link mt-3 text-sm">
          {ver ? "Esconder encerrados" : `Mostrar encerrados (${encerrados})`}
        </button>
      )}
      {semSituacao > 0 && <p className="mt-2 text-xs text-muted">{semSituacao} sem situação informada pelo INPI.</p>}
    </div>
  );
}
