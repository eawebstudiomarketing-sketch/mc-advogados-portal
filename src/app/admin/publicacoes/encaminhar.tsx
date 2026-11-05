"use client";

import { useRef } from "react";
import { Forward } from "lucide-react";
import { encaminharPublicacaoAction } from "./actions";

// "Encaminhar para…": escolhe a pessoa e a publicação passa a ser dela (ela recebe aviso).

export function Encaminhar({ id, equipe, atual, classe }: { id: string; equipe: { id: string; nome: string }[]; atual: string | null; classe?: string }) {
  const caixa = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={caixa} className="relative">
      <summary className={classe ?? "ui-btn-secondary inline-flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-xs"}>
        <Forward className="h-3.5 w-3.5" aria-hidden /> Encaminhar para…
      </summary>
      <form
        action={encaminharPublicacaoAction}
        onSubmit={() => setTimeout(() => caixa.current?.removeAttribute("open"), 0)}
        className="absolute left-0 z-20 mt-2 flex w-64 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-lg"
      >
        <input type="hidden" name="id" value={id} />
        <label className="text-xs text-muted" htmlFor={`para-${id}`}>
          Quem fica responsável
        </label>
        <select id={`para-${id}`} name="para" required defaultValue={atual ?? ""} className="ui-input py-1.5 text-sm">
          <option value="" disabled>
            Escolha a pessoa
          </option>
          {equipe.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <button type="submit" className="ui-btn px-3 py-1.5 text-xs">
          Encaminhar e avisar
        </button>
      </form>
    </details>
  );
}
