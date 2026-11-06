"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { EquipeCompleta } from "@/lib/rotina-relatorio/alerta";

// Cartãozinho para o admin máximo (06/11/2026): quando toda a equipe com
// relatório já enviou o de hoje, avisa uma vez por dia, com o atalho para
// aprovar (Rotinas → Aprovar relatórios).

export function AvisoEquipeCompleta({ info }: { info: EquipeCompleta }) {
  const router = useRouter();
  useEffect(() => {
    const chave = `mc:equipe-completa:${info.dia}`;
    try {
      if (localStorage.getItem(chave)) return;
      localStorage.setItem(chave, "1");
    } catch {
      return;
    }
    toast.success(info.total > 1 ? `Todo mundo terminou: as ${info.total} pessoas enviaram o relatório de hoje.` : "A equipe enviou o relatório de hoje.", {
      description: info.paraAprovar ? `${info.paraAprovar} para você aprovar.` : "Todos já aprovados.",
      duration: 20_000,
      ...(info.paraAprovar ? { action: { label: "Aprovar", onClick: () => router.push("/admin/rotinas?aprovar=1", { scroll: false }) } } : {}),
    });
  }, [info.dia, info.total, info.paraAprovar, router]);
  return null;
}
