"use client";

import { useEffect, useState } from "react";
import { peticoesAction } from "../../actions";

// Ficha → "Petições do processo": o pePI é lido ao abrir a ficha (o Marca
// Acompanhada faz igual e mostra "Atualizando..." enquanto isso).

type Peticao = { protocolo: string; data: string | null; servico: string; descricao: string; pagamento: string | null };

const dataBR = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

export function PeticoesProcesso({ processo }: { processo: string }) {
  const [lista, setLista] = useState<Peticao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    peticoesAction(processo).then((r) => {
      if (!vivo) return;
      if (r.ok) setLista(r.peticoes);
      else setErro(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [processo]);

  return (
    <div className="overflow-x-auto">
      <table className="ui-table">
        <thead>
          <tr>
            <th className="px-5 py-2.5">Data</th>
            <th className="px-5 py-2.5">Protocolo</th>
            <th className="px-5 py-2.5">Código</th>
            <th className="px-5 py-2.5">Descrição</th>
            <th className="px-5 py-2.5">Pagto.</th>
            <th className="px-5 py-2.5">Detalhes pagto.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {!lista && (
            <tr>
              <td colSpan={6} className="px-5 py-4 text-sm text-muted">
                {erro ? `Não foi possível ler as petições no INPI agora (${erro}).` : "Atualizando..."}
              </td>
            </tr>
          )}
          {lista?.length === 0 && (
            <tr>
              <td colSpan={6} className="px-5 py-4 text-sm text-muted">
                Nenhuma petição no INPI.
              </td>
            </tr>
          )}
          {lista?.map((p) => (
            <tr key={p.protocolo} className="align-top">
              <td className="px-5 py-3 text-sm tabular-nums">{dataBR(p.data)}</td>
              <td className="px-5 py-3 text-sm tabular-nums">{p.protocolo}</td>
              <td className="px-5 py-3 text-sm tabular-nums">{p.servico}</td>
              <td className="px-5 py-3 text-sm">{p.descricao}</td>
              <td className="px-5 py-3 text-sm">{p.pagamento ? "Pagamento Conciliado" : "—"}</td>
              <td className="px-5 py-3 text-sm">{p.pagamento ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
