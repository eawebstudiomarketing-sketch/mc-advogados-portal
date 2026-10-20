"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { Responsavel } from "@/lib/data/responsaveis";

/**
 * Envolvidos na atividade, além do responsável. Cada um tem os mesmos poderes
 * do responsável (vê, edita, aparece na agenda dele e recebe aviso). Vai no
 * formulário como vários campos "envolvidos".
 */
export function EnvolvidosSelect({
  responsaveis,
  defaultValue = [],
  name = "envolvidos",
}: {
  responsaveis: Responsavel[];
  defaultValue?: string[];
  name?: string;
}) {
  const [sel, setSel] = useState<string[]>(defaultValue.filter((id) => responsaveis.some((r) => r.id === id)));
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const porId = useMemo(() => new Map(responsaveis.map((r) => [r.id, r])), [responsaveis]);
  const opcoes = responsaveis.filter((r) => !sel.includes(r.id) && r.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <div>
      <input type="hidden" name={`${name}_presente`} value="1" />
      {sel.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        {sel.map((id) => {
          const r = porId.get(id)!;
          return (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-0.5 pr-1 pl-0.5 text-xs text-foreground">
              <Avatar nome={r.nome} tamanho={22} />
              {r.nome}
              <button
                type="button"
                onClick={() => setSel((s) => s.filter((x) => x !== id))}
                className="rounded-full p-0.5 text-muted hover:bg-surface-2 hover:text-foreground"
                aria-label={`Tirar ${r.nome}`}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 py-1 text-xs text-foreground/70 hover:border-navy hover:text-foreground"
        >
          <Plus className="h-3 w-3" aria-hidden /> Adicionar envolvido
        </button>
      </div>
      {aberto && (
        <div className="mt-2 rounded-xl border border-border bg-surface p-2 shadow-sm">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pessoa"
            aria-label="Buscar pessoa"
            className="ui-input !py-1.5 text-sm"
            autoFocus
          />
          <ul className="mt-1 max-h-48 overflow-y-auto">
            {opcoes.length === 0 && <li className="px-2 py-2 text-xs text-muted">Ninguém encontrado.</li>}
            {opcoes.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSel((s) => [...s, r.id]);
                    setBusca("");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  <Avatar nome={r.nome} tamanho={24} />
                  <span className="min-w-0 flex-1 truncate">{r.nome}</span>
                  {!r.temLogin && <span className="text-[11px] text-muted">sem login</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
