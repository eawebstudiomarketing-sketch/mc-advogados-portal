"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Clock, Loader2 } from "lucide-react";
import { MinhaRotina, type ItemRotinaTela } from "@/components/rotina/minha-rotina";
import { minhaRotinaHojeAction } from "@/app/admin/rotina/actions";

// Reloginho do topo (30/10/2026): abre a rotina de hoje num cartão por cima da
// tela em que a pessoa está, sem trocar de página. Dá para marcar ali mesmo.

export function RotinaRelogio({ alerta }: { alerta: { atrasadas: number; relatorioPendente: boolean } }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<ItemRotinaTela[] | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [rota, setRota] = useState(pathname);
  if (rota !== pathname) {
    setRota(pathname);
    setAberto(false);
  }
  const precisa = alerta.atrasadas > 0 || alerta.relatorioPendente;

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    void minhaRotinaHojeAction().then((r) => vivo && setItens(r));
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      vivo = false;
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={precisa ? `Sua rotina: ${[alerta.atrasadas ? `${alerta.atrasadas} tarefa(s) atrasada(s)` : "", alerta.relatorioPendente ? "relatório por enviar" : ""].filter(Boolean).join(" e ")}` : "Sua rotina"}
        data-tip={precisa ? "Sua rotina precisa de você" : "Sua rotina"}
        className="relative rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Clock className="h-[18px] w-[18px]" />
        {precisa && <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-status-danger ring-2 ring-surface" aria-hidden />}
      </button>
      {aberto && (
        <div role="dialog" aria-label="Minha rotina de hoje" className="absolute top-[calc(100%+8px)] right-0 z-50 w-80 max-w-[calc(100vw-2rem)] animate-[enter_160ms_var(--ease-out)_both] shadow-[0_18px_40px_-12px_rgba(15,26,42,0.3)]">
          {itens === null ? (
            <div className="ui-card flex items-center justify-center gap-2 p-6 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando a rotina…
            </div>
          ) : itens.length ? (
            <MinhaRotina key={itens.map((i) => `${i.id}${i.feito}`).join()} pequeno itens={itens} podeMarcar />
          ) : (
            <div className="ui-card p-4 text-sm text-muted">Nada da sua rotina para hoje.</div>
          )}
          {alerta.relatorioPendente && (
            <a href="/admin/rotinas" className="mt-2 block rounded-xl bg-status-pending-bg px-3 py-2 text-xs font-medium text-status-pending hover:underline">
              Seu relatório do dia ainda não foi enviado · abrir rotinas
            </a>
          )}
        </div>
      )}
    </div>
  );
}
