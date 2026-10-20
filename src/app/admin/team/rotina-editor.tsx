"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { excluirItemRotinaAction, salvarItemRotinaAction } from "@/app/admin/rotina/actions";

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const NOMES_DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

type Item = { id: string; titulo: string; dias: number[] };

/** Botões dos dias da semana (D S T Q Q S S). */
function Dias({ dias, onChange }: { dias: number[]; onChange?: (d: number[]) => void }) {
return (
  <span className="flex shrink-0 gap-0.5" role="group" aria-label="Dias da semana">
    {DIAS.map((d, i) => {
      const on = dias.includes(i);
      return (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(on ? dias.filter((x) => x !== i) : [...dias, i])}
          aria-pressed={on}
          title={NOMES_DIAS[i]}
          className={`h-6 w-6 rounded-md text-[11px] font-semibold transition-colors ${on ? "bg-navy text-white" : "bg-surface-2 text-muted"} ${onChange ? "hover:opacity-80" : "cursor-default"}`}
        >
          {d}
        </button>
      );
    })}
  </span>
)
}

/** Rotina diária de uma pessoa (o admin máximo edita; os outros só veem). */
export function RotinaEditor({
  pessoa,
  itens: inicial,
  progresso,
  podeEditar,
}: {
  pessoa: { id: string; nome: string; foto: string | null };
  itens: Item[];
  progresso: { feitos: number; total: number } | null;
  podeEditar: boolean;
}) {
  const [itens, setItens] = useState(inicial);
  const [novo, setNovo] = useState("");
  const [diasNovo, setDiasNovo] = useState([1, 2, 3, 4, 5]);
  const [pending, start] = useTransition();

  function salvar(item: Item) {
    start(async () => {
      const r = await salvarItemRotinaAction({ id: item.id, responsavelId: pessoa.id, titulo: item.titulo, dias: item.dias });
      if (!r.ok) toast.error(r.erro);
    });
  }
  function adicionar() {
    if (!novo.trim()) return;
    start(async () => {
      const r = await salvarItemRotinaAction({ responsavelId: pessoa.id, titulo: novo, dias: diasNovo });
      if (!r.ok || !r.id) return void toast.error(r.erro);
      setItens((xs) => [...xs, { id: r.id!, titulo: novo.trim(), dias: [...diasNovo].sort() }]);
      setNovo("");
    });
  }
  function excluir(item: Item) {
    if (!confirm(`Tirar "${item.titulo}" da rotina de ${pessoa.nome}? Os pontos já ganhos continuam.`)) return;
    setItens((xs) => xs.filter((x) => x.id !== item.id));
    start(async () => {
      const r = await excluirItemRotinaAction(item.id);
      if (!r.ok) toast.error(r.erro);
    });
  }

  return (
    <div className="ui-card p-4">
      <div className="mb-2 flex items-center gap-3">
        <Avatar nome={pessoa.nome} foto={pessoa.foto} tamanho={32} />
        <p className="min-w-0 flex-1 truncate font-medium text-foreground">{pessoa.nome}</p>
        {progresso && progresso.total > 0 && (
          <span className={`text-xs font-semibold ${progresso.feitos === progresso.total ? "text-status-success" : "text-muted"}`}>
            Hoje: {progresso.feitos}/{progresso.total}
          </span>
        )}
      </div>
      {itens.length === 0 && <p className="py-2 text-sm text-muted">Sem rotina definida.</p>}
      <ul className="divide-y divide-border">
        {itens.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
            {podeEditar ? (
              <input
                defaultValue={item.titulo}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t && t !== item.titulo) {
                    const novoItem = { ...item, titulo: t };
                    setItens((xs) => xs.map((x) => (x.id === item.id ? novoItem : x)));
                    salvar(novoItem);
                  }
                }}
                className="min-w-40 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-foreground hover:border-border focus:border-navy-3 focus:outline-none"
                aria-label="Item da rotina"
              />
            ) : (
              <span className="min-w-40 flex-1 px-2 text-sm text-foreground">{item.titulo}</span>
            )}
            <Dias
              dias={item.dias}
              onChange={
                podeEditar
                  ? (d) => {
                      if (!d.length) return;
                      const novoItem = { ...item, dias: d.sort() };
                      setItens((xs) => xs.map((x) => (x.id === item.id ? novoItem : x)));
                      salvar(novoItem);
                    }
                  : undefined
              }
            />
            {podeEditar && (
              <button type="button" onClick={() => excluir(item)} className="icon-btn icon-btn-danger" aria-label={`Tirar ${item.titulo}`}>
                <Trash2 aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
      {podeEditar && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
            maxLength={140}
            placeholder="Novo item (ex.: Conferir publicações do dia)"
            className="ui-input min-w-48 flex-1 !py-1.5 text-sm"
            aria-label="Novo item da rotina"
          />
          <Dias dias={diasNovo} onChange={(d) => d.length && setDiasNovo(d)} />
          <button type="button" onClick={adicionar} disabled={!novo.trim() || pending} className="ui-btn px-3 py-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar
          </button>
        </div>
      )}
    </div>
  );
}
