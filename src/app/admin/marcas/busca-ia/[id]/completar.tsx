"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { analiseVisualBuscaAction, completarMarcaBuscaAction, pendentesRelatorioAction } from "../../busca-actions";

// 2ª etapa do relatório (17/11/2026): com a página aberta, completa uma marca por vez
// (dados + logo do INPI, com pausa para o INPI não bloquear) e depois faz a análise visual.
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function CompletarRelatorio({ id, total, faltam, visualPendente }: { id: string; total: number; faltam: number; visualPendente: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(faltam || visualPendente ? "Preparando…" : null);
  const rodando = useRef(false);

  useEffect(() => {
    if (rodando.current || (!faltam && !visualPendente)) return;
    rodando.current = true;
    void (async () => {
      const p = await pendentesRelatorioAction(id);
      let feitos = total - p.processos.length;
      for (const proc of p.processos) {
        setMsg(`Buscando dados e logos das marcas citadas no INPI: ${feitos + 1} de ${total}…`);
        await completarMarcaBuscaAction(id, proc).catch(() => null);
        feitos++;
        if (feitos % 3 === 0) router.refresh();
        await pausa(1500);
      }
      router.refresh();
      if (p.visual) {
        setMsg("Comparando o logo com os logos das anterioridades (análise visual)…");
        await analiseVisualBuscaAction(id).catch(() => null);
      }
      setMsg(null);
      router.refresh();
    })();
  }, [id, total, faltam, visualPendente, router]);

  if (!msg) return null;
  return (
    <p role="status" className="mt-4 flex items-center gap-2 rounded-md border border-[#c9d8ee] bg-[#eef4fb] px-4 py-2.5 text-[12.5px] text-[#1f5fa8] print:hidden">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {msg} Pode deixar a página aberta; o relatório se completa sozinho.
    </p>
  );
}
