"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListTodo, Plus, X } from "lucide-react";
import type { ItemChecklist } from "@/lib/checklist";
import { salvarChecklistAction } from "@/app/admin/activities/modal-actions";

// Subtarefas dentro da atividade (item 21 da auditoria, 30/10/2026): marcar,
// incluir e tirar. Cada mudança grava a lista inteira; se der erro, volta como estava.

export function ChecklistAtividade({ atividadeId, inicial }: { atividadeId: string; inicial: ItemChecklist[] }) {
  const router = useRouter();
  const [itens, setItens] = useState(inicial);
  const [novo, setNovo] = useState("");
  const [, start] = useTransition();
  const feitos = itens.filter((i) => i.feito).length;

  function gravar(lista: ItemChecklist[]) {
    const antes = itens;
    setItens(lista);
    start(async () => {
      const erro = await salvarChecklistAction(atividadeId, lista);
      if (erro) {
        toast.error(erro);
        setItens(antes);
      } else router.refresh();
    });
  }

  function incluir() {
    const texto = novo.trim();
    if (!texto) return;
    setNovo("");
    gravar([...itens, { id: crypto.randomUUID(), texto: texto.slice(0, 300), feito: false }]);
  }

  return (
    <div className="mt-5 rounded-xl border border-border">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <ListTodo className="h-4 w-4 text-muted" aria-hidden />
        <p className="flex-1 text-sm font-medium text-foreground">Checklist</p>
        {itens.length > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {feitos} de {itens.length}
          </span>
        )}
      </div>
      {itens.length > 0 && (
        <>
          <div className="h-1 bg-surface-2" aria-hidden>
            <div className="h-full bg-status-success transition-[width] duration-300" style={{ width: `${(feitos / itens.length) * 100}%` }} />
          </div>
          <ul className="divide-y divide-border">
            {itens.map((i) => (
              <li key={i.id} className="group/ck flex items-center gap-2.5 px-4 py-2">
                <input
                  type="checkbox"
                  checked={i.feito}
                  onChange={() => gravar(itens.map((x) => (x.id === i.id ? { ...x, feito: !x.feito } : x)))}
                  aria-label={`Marcar "${i.texto}"`}
                  className="h-4 w-4 cursor-pointer rounded border-border-strong accent-[var(--navy)]"
                />
                <span className={`min-w-0 flex-1 text-sm ${i.feito ? "text-muted line-through" : "text-foreground/90"}`}>{i.texto}</span>
                <button
                  type="button"
                  onClick={() => gravar(itens.filter((x) => x.id !== i.id))}
                  aria-label={`Tirar "${i.texto}"`}
                  className="rounded-md p-1 text-muted opacity-0 transition-opacity group-hover/ck:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          incluir();
        }}
        className="flex items-center gap-2 border-t border-border px-4 py-2 first:border-t-0"
      >
        <Plus className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="Adicionar subtarefa e apertar Enter"
          aria-label="Nova subtarefa"
          maxLength={300}
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
      </form>
    </div>
  );
}
