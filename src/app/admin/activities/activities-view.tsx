"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Columns3, List, Pencil } from "lucide-react";
import type { Activity } from "@/lib/data/activities";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { StatusSelect } from "./status-select";
import { deleteActivityAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatDate } from "@/lib/mock-data";
import { ActivitiesKanban } from "./activities-kanban";
import { BulkBar } from "./bulk-bar";
import { AtividadeLink, useAbrirAtividade } from "@/components/atividade/atividade-modal";
import { nomeResponsavel } from "@/lib/responsavel-nome";

const CHAVE_MODO = "mc:atividades:modo";
const TODOS = "";
type Modo = "list" | "kanban";

// Lista/Quadro lembrado na sessão (ao sair e voltar para a tela)
const ouvintesModo = new Set<() => void>();
function lerModo(): Modo {
  try {
    return sessionStorage.getItem(CHAVE_MODO) === "kanban" ? "kanban" : "list";
  } catch {
    return "list";
  }
}
function gravarModo(m: Modo) {
  try {
    sessionStorage.setItem(CHAVE_MODO, m);
  } catch {}
  ouvintesModo.forEach((f) => f());
}

function Caixa({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (e: React.MouseEvent<HTMLInputElement>) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={() => {}}
      onClick={onChange}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded border-border-strong accent-[var(--navy)]"
    />
  );
}

export function ActivitiesView({
  activities: todasAtividades,
  arquivadas = false,
  podeExcluir = true,
}: {
  activities: Activity[];
  arquivadas?: boolean;
  podeExcluir?: boolean;
}) {
  const mode = useSyncExternalStore(
    (f) => {
      ouvintesModo.add(f);
      return () => ouvintesModo.delete(f);
    },
    lerModo,
    () => "list" as Modo
  );
  const setMode = gravarModo;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [responsavel, setResponsavel] = useState(TODOS);
  const ultimoClique = useRef<number | null>(null);
  const abrir = useAbrirAtividade();


  const nomes = useMemo(
    () => [...new Set(todasAtividades.map((a) => nomeResponsavel(a)).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b)),
    [todasAtividades]
  );
  const activities = useMemo(
    () => (responsavel === TODOS ? todasAtividades : todasAtividades.filter((a) => nomeResponsavel(a) === responsavel)),
    [todasAtividades, responsavel]
  );

  // some da seleção o que não existe mais (excluído, por exemplo)
  const idsAtuais = useMemo(() => new Set(activities.map((a) => a.id)), [activities]);
  const selecionadas = [...sel].filter((id) => idsAtuais.has(id));
  const todas = activities.length > 0 && selecionadas.length === activities.length;
  const algumas = selecionadas.length > 0 && !todas;

  function alternar(index: number, shift: boolean) {
    const id = activities[index].id;
    setSel((atual) => {
      const novo = new Set([...atual].filter((x) => idsAtuais.has(x)));
      const marcar = !novo.has(id);
      // Shift+clique marca/desmarca o intervalo desde o último clique
      if (shift && ultimoClique.current !== null) {
        const [de, ate] = [ultimoClique.current, index].sort((a, b) => a - b);
        for (let i = de; i <= ate; i++) {
          if (marcar) novo.add(activities[i].id);
          else novo.delete(activities[i].id);
        }
      } else if (marcar) novo.add(id);
      else novo.delete(id);
      return novo;
    });
    ultimoClique.current = index;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
      <div role="tablist" aria-label="Modo de exibição" className="inline-flex items-center gap-0.5 rounded-xl bg-[#eceef2] p-1">
        {([
          ["list", "Lista", List],
          ["kanban", "Quadro", Columns3],
        ] as const).map(([m, rotulo, Icone]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-[background-color,color,box-shadow] duration-150 ${
              mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            <Icone className="h-3.5 w-3.5" aria-hidden />
            {rotulo}
          </button>
        ))}
      </div>
        {nomes.length > 1 && (
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            aria-label="Filtrar por responsável"
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
          >
            <option value={TODOS}>Todos os responsáveis</option>
            {nomes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </div>

      {mode === "kanban" ? (
        <ActivitiesKanban activities={activities} />
      ) : (
        <>
          <div className="overflow-x-auto ui-card">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="w-10 py-2.5 pr-0 pl-5">
                    <Caixa
                      checked={todas}
                      indeterminate={algumas}
                      label={todas ? "Desmarcar todas" : "Selecionar todas"}
                      onChange={() => setSel(todas ? new Set() : new Set(activities.map((a) => a.id)))}
                    />
                  </th>
                  <th className="px-5 py-2.5 font-medium">Atividade</th>
                  <th className="px-5 py-2.5 font-medium">Cliente</th>
                  <th className="px-5 py-2.5 font-medium">Responsável</th>
                  <th className="px-5 py-2.5 font-medium">Prazo</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activities.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted">
                      {arquivadas ? "Nenhuma atividade arquivada." : "Nenhuma atividade registrada ainda."}
                    </td>
                  </tr>
                )}
                {activities.map((a, i) => {
                  const marcada = sel.has(a.id);
                  return (
                    <tr
                      key={a.id}
                      onClick={(e) => {
                        // clique na linha (fora de caixas, selects e botões) abre a mini tela
                        if ((e.target as HTMLElement).closest("a,button,select,input,label,form")) return;
                        abrir(a.id);
                      }}
                      className={`cursor-pointer ${marcada ? "!bg-navy/[0.045]" : "hover:bg-surface-2/70"}`}
                    >
                      <td className="py-3 pr-0 pl-5">
                        <Caixa checked={marcada} label={`Selecionar "${a.title}"`} onChange={(e) => alternar(i, e.shiftKey)} />
                      </td>
                      <td className="px-5 py-3">
                        <AtividadeLink id={a.id} className="font-medium text-navy-3 underline-offset-2 hover:underline">
                          {a.title}
                        </AtividadeLink>
                        <p className="text-xs text-muted">{ACTIVITY_TYPE_LABEL[a.type]}</p>
                      </td>
                      <td className="px-5 py-3 text-foreground/70">{a.clients?.name}</td>
                      <td className="px-5 py-3 text-foreground/70">{nomeResponsavel(a) ?? "—"}</td>
                      <td className="px-5 py-3 text-foreground/70">{a.deadline ? formatDate(a.deadline) : "—"}</td>
                      <td className="px-5 py-3">
                        <StatusSelect key={`${a.id}-${a.status}`} id={a.id} status={a.status} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <button type="button" onClick={() => abrir(a.id, { editar: true })} className="icon-btn" aria-label="Editar" data-tip="Editar">
                            <Pencil aria-hidden />
                          </button>
                          {podeExcluir && (
                          <ConfirmSubmitButton
                            action={deleteActivityAction}
                            hiddenFields={{ id: a.id }}
                            confirmMessage={`Excluir a atividade "${a.title}"?`}
                            label="Excluir"
                            icon="trash"
                          />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {activities.length > 1 && (
            <p className="mt-2 text-xs text-muted">Dica: segure Shift ao clicar para selecionar várias de uma vez.</p>
          )}
          <BulkBar ids={selecionadas} arquivadas={arquivadas} podeExcluir={podeExcluir} onLimpar={() => setSel(new Set())} />
        </>
      )}
    </div>
  );
}
