"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { aprovarRelatorioAction } from "@/app/admin/rotinas/relatorio-actions";

// Aprovação do relatório de uma pessoa: nota de 0 a 10 e um comentário.
// A nota entra na avaliação da pessoa (Indicadores e Painel do Dono).

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function AprovarRelatorio({
  responsavelId,
  dia,
  nota: notaInicial,
  comentario: comentarioInicial,
  aprovadoEm,
  aprovador,
}: {
  responsavelId: string;
  dia: string;
  nota: number | null;
  comentario: string | null;
  aprovadoEm: string | null;
  aprovador: string;
}) {
  const [nota, setNota] = useState<number | null>(notaInicial);
  const [comentario, setComentario] = useState(comentarioInicial ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const aprovado = !!aprovadoEm;

  function aprovar() {
    if (nota === null) return setErro("Escolha uma nota de 0 a 10.");
    setErro(null);
    start(async () => {
      const r = await aprovarRelatorioAction(responsavelId, dia, nota, comentario);
      if (!r.ok) return setErro(r.error);
      toast.success(aprovado ? "Nota atualizada." : "Relatório aprovado.");
      router.refresh();
    });
  }

  return (
    <section className="ui-card space-y-3 p-4" aria-label="Aprovação do relatório">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Aprovação · {aprovador}</h3>
        {aprovado && (
          <span className="inline-flex items-center gap-1.5 rounded bg-status-success-bg px-2.5 py-1 text-xs font-semibold text-status-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Aprovado em {quando(aprovadoEm!)} · nota {notaInicial}
          </span>
        )}
      </div>
      <div role="radiogroup" aria-label="Nota de 0 a 10" className="flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={nota === i}
            onClick={() => {
              setNota(i);
              setErro(null);
            }}
            className={`h-9 w-9 rounded-lg border text-sm font-semibold tabular-nums transition-colors ${nota === i ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/80 hover:border-border-strong"}`}
          >
            {i}
          </button>
        ))}
      </div>
      <label htmlFor="aprov-comentario" className="sr-only">
        Comentário
      </label>
      <textarea id="aprov-comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={1000} placeholder="Comentário para a pessoa (opcional)" className="ui-input w-full resize-y text-sm" />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={aprovar} disabled={pending} className="ui-btn">
          {pending ? "Salvando…" : aprovado ? "Atualizar nota" : "Aprovar relatório"}
        </button>
        {erro && <p className="text-sm text-status-danger">{erro}</p>}
      </div>
    </section>
  );
}
