"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ExternalLink, Printer, RotateCcw, Trash2 } from "lucide-react";
import { aceitandoAction, excluirRegimentoAction, marcarEnviadoAction, reabrirRespostasAction } from "../actions";

// Topo do regimento: copiar link (a pessoa manda no Zap/e-mail), ver como a
// empresa vê, "Aceitando respostas", excluir.
export function BotoesRegimento({ id, link, aceitando, clientId }: { id: string; link: string; aceitando: boolean; clientId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            toast.success("Link copiado. É só colar no WhatsApp ou e-mail da empresa.");
          } catch {
            window.prompt("Copie o link:", link);
          }
          start(async () => {
            await marcarEnviadoAction(id);
            router.refresh();
          });
        }}
        className="ui-btn"
      >
        <Copy className="h-4 w-4" aria-hidden /> Copiar link
      </button>
      <a href={link} target="_blank" rel="noreferrer" className="ui-btn-secondary">
        <ExternalLink className="h-4 w-4" aria-hidden /> Ver como a empresa vê
      </a>
      <label className="ml-1 inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={aceitando}
          disabled={pending}
          onChange={(e) =>
            start(async () => {
              const r = await aceitandoAction(id, e.target.checked);
              if (!r.ok) return void toast.error(r.error);
              router.refresh();
            })
          }
          className="h-4 w-4 accent-navy"
        />
        Aceitando respostas
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Excluir este regimento e as respostas? Não dá para desfazer.")) return;
          start(async () => {
            const r = await excluirRegimentoAction(id);
            if (!r.ok) return void toast.error(r.error);
            router.push(clientId ? `/admin/clients/${clientId}?aba=regimento` : "/admin/regimentos");
          });
        }}
        className="ui-btn-secondary ml-auto text-status-danger"
      >
        <Trash2 className="h-4 w-4" aria-hidden /> Excluir
      </button>
    </div>
  );
}

/** Aba Respostas: imprimir (PDF) e devolver para a empresa corrigir. */
export function BotoesRespostas({ id, respondido }: { id: string; respondido: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="ui-btn">
        <Printer className="h-4 w-4" aria-hidden /> Imprimir / PDF
      </button>
      {respondido && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Reabrir para a empresa corrigir? O mesmo link volta a aceitar respostas, com o que ela já respondeu.")) return;
            start(async () => {
              const r = await reabrirRespostasAction(id);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Reaberto. Mande o mesmo link de novo.");
              router.refresh();
            });
          }}
          className="ui-btn-secondary"
        >
          <RotateCcw className="h-4 w-4" aria-hidden /> Reabrir para a empresa corrigir
        </button>
      )}
    </div>
  );
}
