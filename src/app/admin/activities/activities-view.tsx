"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight, Columns3, List, ListChecks, ListTodo, Pencil } from "lucide-react";
import { lerChecklist } from "@/lib/checklist";
import type { Activity } from "@/lib/data/activities";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { StatusSelect } from "./status-select";
import { EtiquetasLinha } from "@/components/atividade/etiquetas";
import type { Etiqueta } from "@/lib/data/etiquetas";
import { deleteActivityAction, bulkUpdateDeadlineAction } from "./actions";
import { EditarNaLinha } from "@/components/ui/editar-na-linha";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatDate } from "@/lib/mock-data";
import { ActivitiesKanban } from "./activities-kanban";
import { BulkBar } from "./bulk-bar";
import { AtividadeLink, useAbrirAtividade } from "@/components/atividade/atividade-modal";
import { nomeResponsavel } from "@/lib/responsavel-nome";
import { Avatar } from "@/components/ui/avatar";
import { ListaVazia } from "@/components/ui/empty-state";

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

// Agrupamento da lista (29/10): por cliente de primeira, ou por responsável, ou sem grupos.
const CHAVE_AGRUPAR = "mc:atividades:agrupar";
type Agrupar = "cliente" | "responsavel" | "nenhum";
const ouvintesAgrupar = new Set<() => void>();
function lerAgrupar(): Agrupar {
  try {
    const v = sessionStorage.getItem(CHAVE_AGRUPAR);
    return v === "responsavel" || v === "nenhum" ? v : "cliente";
  } catch {
    return "cliente";
  }
}
function gravarAgrupar(m: Agrupar) {
  try {
    sessionStorage.setItem(CHAVE_AGRUPAR, m);
  } catch {}
  ouvintesAgrupar.forEach((f) => f());
}

type Grupo = { chave: string; titulo: string; foto?: string | null; itens: Activity[] };

function agruparPor(lista: Activity[], como: Agrupar): Grupo[] {
  if (como === "nenhum") return [{ chave: "todas", titulo: "", itens: lista }];
  const mapa = new Map<string, Grupo>();
  for (const a of lista) {
    const chave = como === "cliente" ? a.client_id ?? "sem" : a.responsavel_id ?? "sem";
    const titulo = como === "cliente" ? a.clients?.name ?? "Sem cliente" : nomeResponsavel(a) ?? "Sem responsável";
    const g = mapa.get(chave) ?? { chave, titulo, foto: como === "responsavel" ? a.responsaveis?.foto_url : null, itens: [] };
    g.itens.push(a);
    mapa.set(chave, g);
  }
  // quem tem mais atrasadas vem primeiro; "sem ..." vai para o fim; depois ordem alfabética
  const atrasadas = (g: Grupo) => g.itens.filter((a) => a.deadline && a.status !== "concluida" && a.status !== "cancelada" && diasAte(a.deadline) < 0).length;
  return [...mapa.values()].sort((x, y) => {
    if ((x.chave === "sem") !== (y.chave === "sem")) return x.chave === "sem" ? 1 : -1;
    return atrasadas(y) - atrasadas(x) || x.titulo.localeCompare(y.titulo, "pt-BR");
  });
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
  filtrado = false,
}: {
  etiquetas?: Etiqueta[];
  /** Há filtro ligado (a lista vazia diz "nada com esses filtros"). */
  filtrado?: boolean;
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


  const agrupar = useSyncExternalStore(
    (f) => {
      ouvintesAgrupar.add(f);
      return () => ouvintesAgrupar.delete(f);
    },
    lerAgrupar,
    () => "cliente" as Agrupar
  );
  // grupos começam fechados (um só grupo, como num filtro por cliente, já vem aberto); "invertidos" guarda o que a pessoa abriu/fechou
  const [invertidos, setInvertidos] = useState<Set<string>>(new Set());

  const grupos = useMemo(() => agruparPor(todasAtividades, agrupar), [todasAtividades, agrupar]);
  const agrupado = agrupar !== "nenhum";
  const abertoPorPadrao = grupos.length === 1;
  const aberto = (g: Grupo) => !agrupado || abertoPorPadrao !== invertidos.has(g.chave);
  // ordem em que as linhas aparecem (a seleção com Shift segue essa ordem); só conta o que está à vista
  const activities = useMemo(
    () => grupos.flatMap((g) => (!agrupado || abertoPorPadrao !== invertidos.has(g.chave) ? g.itens : [])),
    [grupos, invertidos, agrupado, abertoPorPadrao]
  );

  function alternarGrupo(chave: string) {
    setInvertidos((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(chave)) novo.add(chave);
      return novo;
    });
  }
  function abrirTodos(abrir: boolean) {
    setInvertidos(new Set(abrir === abertoPorPadrao ? [] : grupos.map((g) => g.chave)));
  }

  // some da seleção o que não existe mais (excluído, por exemplo)
  const idsAtuais = useMemo(() => new Set(todasAtividades.map((a) => a.id)), [todasAtividades]);
  const selecionadas = [...sel].filter((id) => idsAtuais.has(id));
  const todas = todasAtividades.length > 0 && selecionadas.length === todasAtividades.length;
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
      {mode === "list" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Agrupar por</span>
          <div role="tablist" aria-label="Agrupar a lista" className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-1">
            {([
              ["cliente", "Cliente"],
              ["responsavel", "Responsável"],
              ["nenhum", "Sem grupos"],
            ] as const).map(([m, rotulo]) => (
              <button
                key={m}
                role="tab"
                aria-selected={agrupar === m}
                onClick={() => {
                  setInvertidos(new Set());
                  gravarAgrupar(m);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-[background-color,color] duration-150 ${
                  agrupar === m ? "bg-navy text-white" : "text-muted hover:text-foreground"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {agrupado && grupos.length > 1 && (
            <button type="button" onClick={() => abrirTodos(grupos.some((g) => !aberto(g)))} className="ui-btn-secondary px-3 py-1.5 text-xs">
              {grupos.some((g) => !aberto(g)) ? "Abrir todos" : "Fechar todos"}
            </button>
          )}
        </div>
      )}
      </div>

      {mode === "kanban" ? (
        <ActivitiesKanban etiquetas={etiquetas} activities={todasAtividades} />
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
                      onChange={() => setSel(todas ? new Set() : new Set(todasAtividades.map((a) => a.id)))}
                    />
                  </th>
                  <th className="px-4">Atividade</th>
                  <th className="px-4">Prazo</th>
                  <th className="px-4">Status</th>
                  <th className="px-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {todasAtividades.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      {arquivadas && !filtrado ? (
                        <ListaVazia icon={ListChecks} filtrado={false} titulo="Nenhuma atividade arquivada" dica="As atividades que você arquivar aparecem aqui." />
                      ) : (
                        <ListaVazia
                          icon={ListChecks}
                          filtrado={filtrado}
                          titulo="Nenhuma atividade ainda"
                          dica="Cadastre a primeira demanda do escritório e ela aparece aqui, com prazo e responsável."
                          acao={{ href: "/admin/activities/new", rotulo: "Nova atividade" }}
                        />
                      )}
                    </td>
                  </tr>
                )}
                {(() => {
                  let corrente = 0; // posição da linha na ordem em que aparecem (para o Shift+clique)
                  return grupos.map((g) => {
                    const abertoAgora = aberto(g);
                    const ids = g.itens.map((x) => x.id);
                    const marcadas = ids.filter((id) => sel.has(id)).length;
                    const abertas = g.itens.filter((x) => x.status === "aberta" || x.status === "em_andamento");
                    const atrasadas = abertas.filter((x) => x.deadline && diasAte(x.deadline) < 0).length;
                    return (
                      <Fragment key={g.chave}>
                        {agrupado && (
                          <tr
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest("input")) return;
                              alternarGrupo(g.chave);
                            }}
                            className="cursor-pointer bg-surface-2/60 hover:bg-surface-2"
                          >
                            <td className="pr-0 pl-5">
                              <Caixa
                                checked={marcadas === ids.length}
                                indeterminate={marcadas > 0 && marcadas < ids.length}
                                label={`Selecionar todas de ${g.titulo}`}
                                onChange={() =>
                                  setSel((atual) => {
                                    const novo = new Set(atual);
                                    for (const id of ids) {
                                      if (marcadas === ids.length) novo.delete(id);
                                      else novo.add(id);
                                    }
                                    return novo;
                                  })
                                }
                              />
                            </td>
                            <td colSpan={4} className="px-2 py-2.5">
                              {/* o clique sobe até a linha, que alterna o grupo (por isso o botão não tem onClick) */}
                              <button
                                type="button"
                                aria-expanded={abertoAgora}
                                className="flex w-full items-center gap-2 text-left"
                              >
                                <ChevronRight className={`h-4 w-4 shrink-0 text-muted transition-transform duration-150 ${abertoAgora ? "rotate-90" : ""}`} aria-hidden />
                                {agrupar === "responsavel" && g.chave !== "sem" && <Avatar nome={g.titulo} foto={g.foto} tamanho={22} />}
                                <span className="truncate text-sm font-semibold text-foreground">{g.titulo}</span>
                                <span className="ml-1 text-xs whitespace-nowrap text-muted">
                                  {abertas.length} {abertas.length === 1 ? "aberta" : "abertas"}
                                  {g.itens.length > abertas.length ? ` · ${g.itens.length} no total` : ""}
                                </span>
                                {atrasadas > 0 && (
                                  <span className="rounded-full bg-status-danger-bg px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-status-danger">
                                    {atrasadas} {atrasadas === 1 ? "atrasada" : "atrasadas"}
                                  </span>
                                )}
                              </button>
                            </td>
                          </tr>
                        )}
                        {abertoAgora &&
                          g.itens.map((a) => {
                  const i = corrente++;
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
                      <td className="max-w-[560px] px-4 py-3">
                        <AtividadeLink id={a.id} className="block font-medium text-status-info underline-offset-2 hover:underline">
                          {a.title}
                        </AtividadeLink>
                        <p className="mt-0.5 truncate text-[13px] text-foreground/75">{a.clients?.name ?? "Sem cliente"}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {nomeResponsavel(a) && (
                            <span title={nomeResponsavel(a)!} className="inline-flex items-center gap-1.5 rounded bg-navy px-1.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
                              {nomeResponsavel(a)!.replace(/^(Dr.?|Dra.?)s+/i, "").split(" ")[0]}
                            </span>
                          )}
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-foreground/75">{ACTIVITY_TYPE_LABEL[a.type]}</span>
                          {a.area && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-foreground/75">{a.area}</span>}
                          {a.cliente_avisado_em && <span className="rounded bg-status-success-bg px-1.5 py-0.5 text-xs font-semibold text-status-success">Cliente avisado</span>}
                          {(() => {
                            const ck = lerChecklist(a.checklist);
                            if (!ck.length) return null;
                            const feitos = ck.filter((x) => x.feito).length;
                            return (
                              <span title="Checklist" className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${feitos === ck.length ? "bg-status-success-bg text-status-success" : "bg-surface-2 text-foreground/75"}`}>
                                <ListTodo className="h-3 w-3" aria-hidden /> {feitos}/{ck.length}
                              </span>
                            );
                          })()}
                          {(a.etiquetas ?? []).length > 0 && <EtiquetasLinha ids={a.etiquetas ?? []} todas={etiquetas} />}
                        </div>
                      </td>
                      <td className="px-4 text-[13px] whitespace-nowrap">
                        <EditarNaLinha id={a.id} tipo="data" valor={a.deadline} rotulo="Prazo" salvar={(ids, v) => bulkUpdateDeadlineAction(ids, v || null)}>
                          {a.deadline ? (
                            <span title={formatDate(a.deadline)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${chipDoPrazo(a)}`}>
                              {textoDoPrazo(a)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">Sem prazo</span>
                          )}
                        </EditarNaLinha>
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
                            confirmMessage={`Excluir a atividade "${a.title}"? Ela fica 30 dias na Lixeira.`}
                            label="Excluir"
                            icon="trash"
                          />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                          })}
                      </Fragment>
                    );
                  });
                })()}
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
