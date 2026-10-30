"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import type { ResultadoLote } from "./selecao-lista";

// Edição direto na lista (item 8 da auditoria, 30/10/2026): o valor aparece
// normal com um lápis ao passar o mouse; clicando vira um campo (data ou
// lista de opções) que salva assim que muda. Usa as mesmas ações das ações em
// massa, com um id só.

type Props = {
  id: string;
  /** O que aparece quando não está editando. */
  children: React.ReactNode;
  rotulo: string;
  salvar: (ids: string[], valor: string) => Promise<ResultadoLote>;
} & ({ tipo: "data"; valor: string | null } | { tipo: "opcoes"; valor: string | null; opcoes: { valor: string; rotulo: string }[] });

export function EditarNaLinha(props: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [pending, start] = useTransition();

  function salvar(v: string) {
    setEditando(false);
    if (v === (props.valor ?? "")) return;
    start(async () => {
      const r = await props.salvar([props.id], v);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`${props.rotulo} atualizado`);
        router.refresh();
      }
    });
  }

  if (editando) {
    const comum = {
      autoFocus: true,
      "aria-label": props.rotulo,
      onBlur: () => setEditando(false),
      onKeyDown: (e: React.KeyboardEvent) => e.key === "Escape" && setEditando(false),
      className: "ui-input h-8 w-auto min-w-[9rem] py-1 text-sm",
    };
    return props.tipo === "data" ? (
      <input type="date" defaultValue={props.valor ?? ""} onChange={(e) => salvar(e.target.value)} {...comum} />
    ) : (
      <select defaultValue={props.valor ?? ""} onChange={(e) => salvar(e.target.value)} {...comum}>
        {props.opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditando(true);
      }}
      disabled={pending}
      aria-label={`Mudar ${props.rotulo.toLowerCase()}`}
      className={`group/ed inline-flex items-center gap-1.5 rounded-md text-left transition-opacity hover:text-foreground ${pending ? "opacity-50" : ""}`}
    >
      {props.children}
      <Pencil className="h-3 w-3 shrink-0 text-muted opacity-0 transition-opacity group-hover/ed:opacity-100 group-focus-visible/ed:opacity-100" aria-hidden />
    </button>
  );
}
