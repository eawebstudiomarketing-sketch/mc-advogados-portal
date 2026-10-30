"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// Card no meio da tela para a rotina de uma pessoa (ou para criar uma nova).
// O conteúdo vem do servidor; fechar volta para a página de Rotinas.

export function ModalRotina({ titulo, subtitulo, fecharHref, cabecalho, children }: { titulo: string; subtitulo?: string; fecharHref: string; cabecalho?: React.ReactNode; children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && router.push(fecharHref, { scroll: false });
    document.addEventListener("keydown", esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = antes;
    };
  }, [router, fecharHref]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-2/50 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" aria-label="Fechar" tabIndex={-1} onClick={() => router.push(fecharHref, { scroll: false })} className="fixed inset-0 cursor-default" />
      <div className="relative my-auto w-full max-w-3xl rounded-lg border border-border bg-surface shadow-lg">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
          {cabecalho}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-medium text-foreground">{titulo}</h2>
            {subtitulo && <p className="text-sm text-muted">{subtitulo}</p>}
          </div>
          <button type="button" onClick={() => router.push(fecharHref, { scroll: false })} className="icon-btn -mr-2" aria-label="Fechar" data-tip="Fechar (Esc)">
            <X aria-hidden />
          </button>
        </header>
        <div className="px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
