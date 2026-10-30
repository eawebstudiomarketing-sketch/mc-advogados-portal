"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { excluirRotinaAction } from "@/app/admin/rotinas/relatorio-actions";

// Três pontinhos no card de rotina (só o admin máximo): configurar ou excluir a rotina da pessoa.

export function MenuRotina({ responsavelId, nome }: { responsavelId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();
  const caixa = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  function excluir() {
    setAberto(false);
    if (!confirm(`Excluir a rotina de ${nome}? As tarefas fixas e o relatório do dia deixam de aparecer para essa pessoa. Os relatórios já enviados continuam guardados.`)) return;
    start(async () => {
      const r = await excluirRotinaAction(responsavelId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Rotina excluída.");
      router.refresh();
    });
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Opções da rotina de ${nome}`}
        className="icon-btn"
      >
        <MoreVertical aria-hidden />
      </button>
      {aberto && (
        <div role="menu" className="absolute top-[calc(100%+4px)] right-0 z-20 w-48 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-lg">
          <Link role="menuitem" href={`/admin/rotinas?pessoa=${responsavelId}&aba=config`} scroll={false} onClick={() => setAberto(false)} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground hover:bg-hover">
            <Settings2 className="h-4 w-4" aria-hidden /> Configurar
          </Link>
          <button role="menuitem" type="button" onClick={excluir} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-status-danger hover:bg-status-danger-bg">
            <Trash2 className="h-4 w-4" aria-hidden /> Excluir rotina
          </button>
        </div>
      )}
    </div>
  );
}
