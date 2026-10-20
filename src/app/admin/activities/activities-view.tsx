"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Columns3, List, Pencil } from "lucide-react";
import type { Activity } from "@/lib/data/activities";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { StatusSelect } from "./status-select";
import { EtiquetasLinha } from "@/components/atividade/etiquetas";
import type { Etiqueta } from "@/lib/data/etiquetas";
import { deleteActivityAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatDate } from "@/lib/mock-data";
import { ActivitiesKanban } from "./activities-kanban";
import { BulkBar } from "./bulk-bar";
import { AtividadeLink, useAbrirAtividade } from "@/components/atividade/atividade-modal";
import { nomeResponsavel } from "@/lib/responsavel-nome";
import { Avatar } from "@/components/ui/avatar";

const CHAVE_MODO = "mc:atividades:modo";
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

const HOJE = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
function diasAte(iso: string) {
  return Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${HOJE()}T12:00:00Z`)) / 86_400_000);
}
function chipDoPrazo(a: Activity): string {
  if (a.status === "concluida" || a.status === "cancelada" || !a.deadline) return "bg-surface-2 text-muted";
  const d = diasAte(a.deadline);
  if (d < 0) return "bg-status-danger-bg text-status-danger";
  if (d === 0) return "bg-status-pending-bg text-status-pending";
  if (d <= 3) return "bg-gold-soft text-gold-ink";
  return "bg-surface-2 text-foreground/75";
}
function textoDoPrazo(a: Activity): string {
  const d = diasAte(a.deadline!);
  if (a.status === "concluida" || a.status === "cancelada") return a.deadline!.split("-").reverse().slice(0, 2).join("/");
  if (d < -1) return `Atrasada ${-d} dias`;
  if (d === -1) return "Venceu ontem";
  if (d === 0) return "Hoje";
  if (d === 1) return "Amanhã";
  if (d <= 7) return `Em ${d} dias`;
  return a.deadline!.split("-").reverse().slice(0, 2).join("/");
}

export function ActivitiesView({
  activities: todasAtividades,
  arquivadas = false,
  podeExcluir = true,
  etiquetas = [],
}: {
  etiquetas?: Etiqueta[];
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
  const ultimoClique = useRef<number | null>(null);
  const abrir = useAbrirAtividade();


  const activities = todasAtividades;

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
      <div role="tablist" aria-label="Modo de exibição" className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-1">
        {([
          ["list", "Lista", List],
          ["kanban", "Quadro", Columns3],
        ] as const).map(([m, rotulo, Icone]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-[background-color,color] duration-150 ${
              mode === m ? "bg-navy text-white" : "text-muted hover:text-foreground"
            }`}
          >
            <Icone className="h-3.5 w-3.5" aria-hidden />
            {rotulo}
          </button>
        ))}
      </div>
      </div>

      {mode === "kanban" ? (
        <ActivitiesKanban etiquetas={etiquetas} activities={activities} />
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
                  <th className="w-10 px-2">Nº</th>
                  <th className="px-4">Atividade</th>
                  <th className="hidden px-4 md:table-cell">Responsável</th>
                  <th className="px-4">Prazo</th>
                  <th className="px-4">Status</th>
                  <th className="px-4"></th>
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
                      <td className="pr-0 pl-5">
                        <Caixa checked={marcada} label={`Selecionar "${a.title}"`} onChange={(e) => alternar(i, e.shiftKey)} />
                      </td>
                      <td className="px-2 align-middle">
                        <span className="eyebrow !text-[11px] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      </td>
                      <td className="max-w-[420px] px-4">
                        <AtividadeLink id={a.id} className="block truncate font-medium text-foreground underline-offset-2 hover:underline">
                          {a.title}
                        </AtividadeLink>
                        {(a.etiquetas ?? []).length > 0 && (
                          <div className="mt-1">
                            <EtiquetasLinha ids={a.etiquetas ?? []} todas={etiquetas} />
                          </div>
                        )}
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {a.clients?.name ?? "Sem cliente"}
                          <span className="mx-1.5 text-border-strong">·</span>
                          {ACTIVITY_TYPE_LABEL[a.type]}
                          {a.area ? (
                            <>
                              <span className="mx-1.5 text-border-strong">·</span>
                              {a.area}
                            </>
                          ) : null}
                        </p>
                      </td>
                      <td className="hidden px-4 md:table-cell">
                        {nomeResponsavel(a) ? (
                          <span className="inline-flex items-center gap-2 text-[13px] text-foreground/80">
                            <Avatar nome={nomeResponsavel(a)!} foto={a.responsaveis?.foto_url} tamanho={26} />
                            {nomeResponsavel(a)!.replace(/^(Dr\.?|Dra\.?)\s+/i, "").split(" ")[0]}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 text-[13px] whitespace-nowrap">
                        {a.deadline ? (
                          <span title={formatDate(a.deadline)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${chipDoPrazo(a)}`}>
                            {textoDoPrazo(a)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Sem prazo</span>
                        )}
                      </td>
                      <td className="px-4">
                        <StatusSelect key={`${a.id}-${a.status}`} id={a.id} status={a.status} />
                      </td>
                      <td className="px-4">
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
