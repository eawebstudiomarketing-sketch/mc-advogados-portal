"use client";

import Link from "next/link";
import { Clock } from "lucide-react";

// Reloginho do topo (03/11/2026): abre a rotina COMPLETA de hoje (tarefas fixas,
// relatório em etapas com as perguntas e, para o admin máximo, os relatórios da
// equipe) num cartão por cima da tela em que a pessoa está, sem ir para Rotinas.
// O cartão é a rota interceptada src/app/admin/@rotina/(.)rotina-hoje.

export function RotinaRelogio({ alerta }: { alerta: { atrasadas: number; relatorioPendente: boolean } }) {
  const precisa = alerta.atrasadas > 0 || alerta.relatorioPendente;

  return (
    <Link
      href="/admin/rotina-hoje"
      scroll={false}
      prefetch={false}
      aria-haspopup="dialog"
      aria-label={precisa ? `Sua rotina: ${[alerta.atrasadas ? `${alerta.atrasadas} tarefa(s) atrasada(s)` : "", alerta.relatorioPendente ? "relatório por enviar" : ""].filter(Boolean).join(" e ")}` : "Sua rotina"}
      data-tip={precisa ? "Sua rotina precisa de você" : "Sua rotina"}
      className="relative rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <Clock className="h-[18px] w-[18px]" />
      {precisa && <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-status-danger ring-2 ring-surface" aria-hidden />}
    </Link>
  );
}
