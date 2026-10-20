"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { marcarRotinaAction } from "@/app/admin/rotina/actions";

type Item = { id: string; titulo: string; feito: boolean };

/** Rotina do dia com caixinhas. Cada item marcado vale 1 ponto no ranking. */
export function MinhaRotina({ itens: inicial, podeMarcar, titulo = "Minha rotina de hoje", compacto = false }: { itens: Item[]; podeMarcar: boolean; titulo?: string; compacto?: boolean }) {
  const [itens, setItens] = useState(inicial);
  const [, start] = useTransition();
  const router = useRouter();
  const feitos = itens.filter((i) => i.feito).length;
  const pct = itens.length ? Math.round((feitos / itens.length) * 100) : 0;

  function alternar(i: Item) {
    if (!podeMarcar) return;
    const novo = !i.feito;
    setItens((xs) => xs.map((x) => (x.id === i.id ? { ...x, feito: novo } : x)));
    start(async () => {
      const r = await marcarRotinaAction(i.id, novo);
      if (!r.ok) {
        setItens((xs) => xs.map((x) => (x.id === i.id ? { ...x, feito: !novo } : x)));
        toast.error(r.erro ?? "Não foi possível salvar.");
      } else {
        if (novo && feitos + 1 === itens.length) toast.success("Rotina do dia completa! 🎉");
        router.refresh(); // ranking ao lado já soma o ponto
      }
    });
  }

  if (!itens.length) return null;
  return (
    <section className={compacto ? "" : "ui-card p-5"}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" aria-hidden /> Rotina · +1 ponto por item
          </p>
          <h2 className="section-title !text-lg">{titulo}</h2>
        </div>
        <span className={`numero-grande text-2xl ${feitos === itens.length ? "text-status-success" : "text-foreground"}`}>
          {feitos}/{itens.length}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full bg-status-success transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 space-y-1">
        {itens.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => alternar(i)}
              disabled={!podeMarcar}
              aria-pressed={i.feito}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors ${podeMarcar ? "hover:bg-surface-2" : "cursor-default"}`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                  i.feito ? "border-status-success bg-status-success text-white" : "border-border-strong"
                }`}
                aria-hidden
              >
                {i.feito && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className={i.feito ? "text-muted line-through" : "text-foreground"}>{i.titulo}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
