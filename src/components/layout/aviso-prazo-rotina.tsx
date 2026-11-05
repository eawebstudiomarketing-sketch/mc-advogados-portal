"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlarmClock } from "lucide-react";
import { toast } from "sonner";
import type { AvisoPrazo } from "@/lib/rotina-relatorio/alerta";

// Aviso do prazo do relatório (05/11/2026): na última hora antes de fechar
// (equipe das 17h às 18h), uma faixa fica fixa no topo de todas as telas
// lembrando o que falta. Na primeira vez do dia também sobe um cartãozinho.
// 05/11/2026: depois das 18:00 a equipe ainda envia até 23:59; a faixa passa a
// dizer que está com atraso (o Maurício é avisado quando ela enviar).
// A hora é a do navegador (Bahia), conferida a cada 30 s: aparece e some sozinha.

const agoraBahia = () => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit", hour12: false })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
};

export function AvisoPrazoRotina({ aviso }: { aviso: AvisoPrazo }) {
  const [faltam, setFaltam] = useState<number | null>(null);
  const [atrasado, setAtrasado] = useState(false);

  useEffect(() => {
    const conferir = () => {
      const { dia, min } = agoraBahia();
      const resta = aviso.prazoHora * 60 - min;
      const dentro = resta > 0 && resta <= 60;
      setFaltam(dentro ? resta : null);
      setAtrasado(resta <= 0 && aviso.prazoHora < 24);
      if (!dentro) return;
      const chave = `mc:aviso-relatorio:${dia}`;
      try {
        if (localStorage.getItem(chave)) return;
        localStorage.setItem(chave, "1");
      } catch {
        return;
      }
      toast.warning(`Falta menos de 1 hora: o prazo do relatório do dia é ${aviso.prazoTexto}.`, { description: "Preencha a rotina e envie o relatório. Depois disso fica com atraso.", duration: 15_000 });
    };
    conferir();
    const t = setInterval(conferir, 30_000);
    return () => clearInterval(t);
  }, [aviso.prazoHora, aviso.prazoTexto]);

  if (faltam === null && !atrasado) return null;
  const falta = [aviso.tarefasFaltando ? `${aviso.tarefasFaltando} tarefa${aviso.tarefasFaltando > 1 ? "s" : ""} da rotina` : "", "enviar o relatório do dia"].filter(Boolean).join(" e ");
  return (
    <div role="status" className="sticky top-14 z-20 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-status-pending/30 bg-status-pending-bg px-4 py-2 text-sm text-foreground print:hidden sm:px-6 lg:px-10">
      <AlarmClock className="h-4 w-4 shrink-0 text-status-pending" aria-hidden />
      <span className="min-w-0 flex-1">
        {atrasado ? (
          <>
            <strong className="font-semibold">Relatório do dia atrasado</strong> (o prazo era {aviso.prazoTexto}). Ainda dá para enviar até 23:59; o Dr. Maurício é avisado do atraso. Falta: {falta}.
          </>
        ) : (
          <>
            <strong className="font-semibold">O prazo do relatório do dia é {aviso.prazoTexto}</strong> (faltam {faltam} min). Falta: {falta}.
          </>
        )}
      </span>
      <Link href="/admin/rotina-hoje" scroll={false} prefetch={false} className="ui-btn px-3 py-1 text-xs">
        Preencher agora
      </Link>
    </div>
  );
}
