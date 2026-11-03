"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronDown, Copy, ListChecks, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { copiarRotinaAction, excluirItemRotinaAction, moverItemRotinaAction, salvarItemRotinaAction } from "@/app/admin/rotina/actions";
import { NOMES_DIAS, descreverRepeticao, type RegraMensal, type SubitemRotina } from "@/lib/rotina-repeticao";

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export type ItemEditor = {
  id: string;
  titulo: string;
  dias: number[];
  hora_inicio: string | null;
  hora_fim: string | null;
  observacao: string | null;
  checklist: SubitemRotina[];
  repeticao: "semanal" | "mensal";
  regra_mensal: RegraMensal | null;
};

/** Botões dos dias da semana (D S T Q Q S S). */
function Dias({ dias, onChange }: { dias: number[]; onChange: (d: number[]) => void }) {
  return (
    <span className="flex shrink-0 gap-0.5" role="group" aria-label="Dias da semana">
      {DIAS.map((d, i) => {
        const on = dias.includes(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              const novo = on ? dias.filter((x) => x !== i) : [...dias, i];
              if (novo.length) onChange(novo.sort());
            }}
            aria-pressed={on}
            title={NOMES_DIAS[i]}
            className={`h-7 w-7 rounded-lg text-[11px] font-semibold transition-colors ${on ? "bg-navy text-white" : "bg-surface-2 text-muted hover:text-foreground"}`}
          >
            {d}
          </button>
        );
      })}
    </span>
  );
}

const REGRA_PADRAO: RegraMensal = { tipo: "dia", dia: 1 };

/** Quando no mês: dia X, 1º/último dia útil, ou a 1ª/2ª/…/última segunda (terça…) do mês. */
function RegraDoMes({ regra, onChange }: { regra: RegraMensal; onChange: (r: RegraMensal) => void }) {
  const sel = "ui-input !w-auto !py-1.5 text-sm";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <select
        value={regra.tipo === "util" ? `util-${regra.qual}` : regra.tipo}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "dia" ? { tipo: "dia", dia: 1 } : v === "semana" ? { tipo: "semana", ordem: 1, dia_semana: 1 } : { tipo: "util", qual: v === "util-ultimo" ? "ultimo" : "primeiro" });
        }}
        aria-label="Quando no mês"
        className={sel}
      >
        <option value="dia">No dia do mês</option>
        <option value="util-primeiro">No 1º dia útil</option>
        <option value="util-ultimo">No último dia útil</option>
        <option value="semana">Num dia da semana</option>
      </select>
      {regra.tipo === "dia" && (
        <select value={regra.dia} onChange={(e) => onChange({ tipo: "dia", dia: Number(e.target.value) })} aria-label="Dia do mês" className={sel}>
          {Array.from({ length: 31 }, (_, k) => k + 1).map((n) => (
            <option key={n} value={n}>
              dia {n}
            </option>
          ))}
        </select>
      )}
      {regra.tipo === "semana" && (
        <>
          <select value={regra.ordem} onChange={(e) => onChange({ ...regra, ordem: Number(e.target.value) as 1 | 2 | 3 | 4 | -1 })} aria-label="Qual semana" className={sel}>
            <option value={1}>1ª</option>
            <option value={2}>2ª</option>
            <option value={3}>3ª</option>
            <option value={4}>4ª</option>
            <option value={-1}>última</option>
          </select>
          <select value={regra.dia_semana} onChange={(e) => onChange({ ...regra, dia_semana: Number(e.target.value) })} aria-label="Dia da semana" className={sel}>
            {NOMES_DIAS.map((n, k) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted">do mês</span>
        </>
      )}
    </span>
  );
}

/** Semanal (dias da semana) ou mensal (regra do mês). */
function Repete({
  valor,
  onChange,
}: {
  valor: Pick<ItemEditor, "repeticao" | "dias" | "regra_mensal">;
  onChange: (v: Pick<ItemEditor, "repeticao" | "dias" | "regra_mensal">) => void;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex rounded-lg bg-surface-2 p-0.5 text-[11px] font-semibold" role="group" aria-label="Repetição">
        {(["semanal", "mensal"] as const).map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={valor.repeticao === r}
            onClick={() => valor.repeticao !== r && onChange({ ...valor, repeticao: r, regra_mensal: r === "mensal" ? valor.regra_mensal ?? REGRA_PADRAO : valor.regra_mensal })}
            className={`rounded-md px-2 py-1 transition-colors ${valor.repeticao === r ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {r === "semanal" ? "Semana" : "Mês"}
          </button>
        ))}
      </span>
      {valor.repeticao === "mensal" ? (
        <RegraDoMes regra={valor.regra_mensal ?? REGRA_PADRAO} onChange={(r) => onChange({ ...valor, regra_mensal: r })} />
      ) : (
        <Dias dias={valor.dias} onChange={(d) => onChange({ ...valor, dias: d })} />
      )}
    </span>
  );
}

/** Subitens que a pessoa vai marcando no dia (tarefa fixa mais complexa). */
function EditorChecklist({ lista, onChange }: { lista: SubitemRotina[]; onChange: (l: SubitemRotina[]) => void }) {
  const [novo, setNovo] = useState("");
  function incluir() {
    const texto = novo.trim();
    if (!texto) return;
    setNovo("");
    onChange([...lista, { id: crypto.randomUUID(), texto: texto.slice(0, 200) }]);
  }
  return (
    <div className="mt-2 rounded-xl border border-border p-2.5">
      <p className="eyebrow mb-1.5 flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5" aria-hidden /> Checklist da tarefa {lista.length > 0 && `· ${lista.length}`}
      </p>
      {lista.length > 0 && (
        <ul className="mb-1.5 space-y-0.5">
          {lista.map((s, k) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted">{k + 1}.</span>
              <input
                defaultValue={s.texto}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.texto && onChange(lista.map((x) => (x.id === s.id ? { ...x, texto: e.target.value.trim().slice(0, 200) } : x)))}
                aria-label={`Subitem ${k + 1}`}
                className="ui-input min-w-0 flex-1 !py-1 text-sm"
              />
              <button type="button" onClick={() => onChange(lista.filter((x) => x.id !== s.id))} className="icon-btn" aria-label={`Tirar ${s.texto}`} data-tip="Tirar subitem">
                <X aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              incluir();
            }
          }}
          maxLength={200}
          placeholder="Novo subitem (Enter para incluir)"
          aria-label="Novo subitem do checklist"
          className="ui-input min-w-0 flex-1 !py-1 text-sm"
        />
        <button type="button" onClick={incluir} disabled={!novo.trim()} className="ui-btn-secondary px-2.5 py-1 text-xs">
          <Plus className="h-3.5 w-3.5" aria-hidden /> Incluir
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted">Quem faz a rotina marca cada subitem no dia; marcando todos, a tarefa se marca sozinha.</p>
    </div>
  );
}

function LinhaItem({
  item,
  primeiro,
  ultimo,
  onSalvar,
  onExcluir,
  onMover,
}: {
  item: ItemEditor;
  primeiro: boolean;
  ultimo: boolean;
  onSalvar: (i: ItemEditor) => void;
  onExcluir: (i: ItemEditor) => void;
  onMover: (i: ItemEditor, d: "subir" | "descer") => void;
}) {
  const [aberto, setAberto] = useState(false);
  const salvarCampo = (parcial: Partial<ItemEditor>) => onSalvar({ ...item, ...parcial });
  return (
    <li className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex shrink-0 flex-col" role="group" aria-label="Prioridade">
          <button type="button" onClick={() => onMover(item, "subir")} disabled={primeiro} className="icon-btn !h-5 !w-6 disabled:opacity-30" aria-label={`Subir ${item.titulo}`} data-tip="Subir na prioridade">
            <ArrowUp aria-hidden />
          </button>
          <button type="button" onClick={() => onMover(item, "descer")} disabled={ultimo} className="icon-btn !h-5 !w-6 disabled:opacity-30" aria-label={`Descer ${item.titulo}`} data-tip="Descer na prioridade">
            <ArrowDown aria-hidden />
          </button>
        </span>
        <span className="flex items-center gap-1">
          <input
            type="time"
            defaultValue={hhmm(item.hora_inicio)}
            onBlur={(e) => e.target.value !== hhmm(item.hora_inicio) && salvarCampo({ hora_inicio: e.target.value || null })}
            aria-label="Início"
            className="ui-input !w-[6.5rem] !py-1.5 text-sm"
          />
          <span className="text-xs text-muted">até</span>
          <input
            type="time"
            defaultValue={hhmm(item.hora_fim)}
            onBlur={(e) => e.target.value !== hhmm(item.hora_fim) && salvarCampo({ hora_fim: e.target.value || null })}
            aria-label="Fim (opcional)"
            className="ui-input !w-[6.5rem] !py-1.5 text-sm"
          />
        </span>
        <input
          defaultValue={item.titulo}
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== item.titulo && salvarCampo({ titulo: e.target.value.trim() })}
          maxLength={140}
          aria-label="O que fazer"
          className="ui-input min-w-48 flex-1 !py-1.5 text-sm font-medium"
        />
        <Repete valor={item} onChange={(v) => salvarCampo(v)} />
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="icon-btn"
          aria-expanded={aberto}
          aria-label="Checklist e observação"
          data-tip={item.checklist.length ? `Checklist (${item.checklist.length}) e como fazer` : "Checklist e como fazer"}
        >
          {item.checklist.length > 0 && !aberto ? <span className="text-[11px] font-semibold tabular-nums">{item.checklist.length}</span> : <ChevronDown className={aberto ? "rotate-180" : ""} aria-hidden />}
        </button>
        <button type="button" onClick={() => onExcluir(item)} className="icon-btn icon-btn-danger" aria-label={`Tirar ${item.titulo}`} data-tip="Tirar da rotina">
          <Trash2 aria-hidden />
        </button>
      </div>
      {item.repeticao === "mensal" && <p className="mt-1 pl-9 text-[11px] text-muted">{descreverRepeticao(item)}</p>}
      {(aberto || item.observacao) && (
        <textarea
          defaultValue={item.observacao ?? ""}
          onBlur={(e) => e.target.value.trim() !== (item.observacao ?? "") && salvarCampo({ observacao: e.target.value.trim() || null })}
          rows={aberto ? 3 : 1}
          maxLength={1000}
          placeholder="Como fazer, link, onde fica (opcional)"
          aria-label="Observação"
          className="ui-input mt-2 text-xs"
        />
      )}
      {aberto && <EditorChecklist lista={item.checklist} onChange={(l) => salvarCampo({ checklist: l })} />}
    </li>
  );
}

/** Editor da rotina de uma pessoa (só o admin máximo vê esta tela de edição). A ordem da lista é a prioridade. */
export function EditorRotina({
  pessoa,
  itens: inicial,
  pessoas,
}: {
  pessoa: { id: string; nome: string };
  itens: ItemEditor[];
  pessoas: { id: string; nome: string; temRotina: boolean }[];
}) {
  const router = useRouter();
  const [itens, setItens] = useState(inicial);
  const [novo, setNovo] = useState<{ titulo: string; inicio: string; fim: string } & Pick<ItemEditor, "repeticao" | "dias" | "regra_mensal">>({
    titulo: "",
    inicio: "",
    fim: "",
    dias: [1, 2, 3, 4, 5],
    repeticao: "semanal",
    regra_mensal: null,
  });
  const [copiarDe, setCopiarDe] = useState("");
  const [pending, start] = useTransition();

  function salvar(item: ItemEditor) {
    setItens((xs) => xs.map((x) => (x.id === item.id ? item : x)));
    start(async () => {
      const r = await salvarItemRotinaAction({
        id: item.id,
        responsavelId: pessoa.id,
        titulo: item.titulo,
        dias: item.dias,
        horaInicio: hhmm(item.hora_inicio) || null,
        horaFim: hhmm(item.hora_fim) || null,
        observacao: item.observacao,
        repeticao: item.repeticao,
        regraMensal: item.regra_mensal,
        checklist: item.checklist,
      });
      if (!r.ok) {
        toast.error(r.erro);
        router.refresh();
      }
    });
  }
  function mover(item: ItemEditor, direcao: "subir" | "descer") {
    const i = itens.findIndex((x) => x.id === item.id);
    const j = direcao === "subir" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= itens.length) return;
    const nova = [...itens];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setItens(nova);
    start(async () => {
      const r = await moverItemRotinaAction(item.id, direcao);
      if (!r.ok) {
        toast.error(r.erro);
        router.refresh();
      }
    });
  }
  function adicionar() {
    if (!novo.titulo.trim()) return;
    start(async () => {
      const r = await salvarItemRotinaAction({
        responsavelId: pessoa.id,
        titulo: novo.titulo,
        dias: novo.dias,
        horaInicio: novo.inicio || null,
        horaFim: novo.fim || null,
        repeticao: novo.repeticao,
        regraMensal: novo.regra_mensal,
      });
      if (!r.ok || !r.id) return void toast.error(r.erro);
      setItens((xs) => [
        ...xs,
        { id: r.id!, titulo: novo.titulo.trim(), dias: [...novo.dias], hora_inicio: novo.inicio || null, hora_fim: novo.fim || null, observacao: null, checklist: [], repeticao: novo.repeticao, regra_mensal: novo.regra_mensal },
      ]);
      setNovo((n) => ({ ...n, titulo: "", inicio: n.fim || "", fim: "" }));
    });
  }
  function excluir(item: ItemEditor) {
    if (!confirm(`Tirar "${item.titulo}" da rotina de ${pessoa.nome}? Os pontos já ganhos continuam.`)) return;
    setItens((xs) => xs.filter((x) => x.id !== item.id));
    start(async () => {
      const r = await excluirItemRotinaAction(item.id);
      if (!r.ok) toast.error(r.erro);
    });
  }
  function copiar() {
    const origem = pessoas.find((p) => p.id === copiarDe);
    if (!origem || !confirm(`Copiar a rotina de ${origem.nome} para ${pessoa.nome}? Os itens são somados aos que já existem.`)) return;
    start(async () => {
      const r = await copiarRotinaAction(copiarDe, pessoa.id);
      if (!r.ok) return void toast.error(r.erro);
      toast.success(`${r.copiados} item(ns) copiado(s).`);
      router.refresh();
    });
  }

  return (
    <div>
      {itens.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong p-6 text-center text-sm text-muted">
          {pessoa.nome.split(" ")[0]} ainda não tem rotina. Adicione o primeiro item abaixo ou copie de outra pessoa.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">A ordem da lista é a prioridade: use as setas para subir ou descer. A rotina do dia aparece nessa ordem.</p>
          <ul className="space-y-2">
            {itens.map((i, k) => (
              <LinhaItem
                key={`${i.id}-${i.hora_inicio}-${i.hora_fim}`}
                item={i}
                primeiro={k === 0}
                ultimo={k === itens.length - 1}
                onSalvar={salvar}
                onExcluir={excluir}
                onMover={mover}
              />
            ))}
          </ul>
        </>
      )}

      {/* novo item */}
      <div className="mt-4 rounded-2xl border border-navy/20 bg-navy/[0.03] p-3">
        <p className="eyebrow mb-2">Novo item</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
            <input type="time" value={novo.inicio} onChange={(e) => setNovo({ ...novo, inicio: e.target.value })} aria-label="Início" className="ui-input !w-[6.5rem] !py-1.5 text-sm" />
            <span className="text-xs text-muted">até</span>
            <input type="time" value={novo.fim} onChange={(e) => setNovo({ ...novo, fim: e.target.value })} aria-label="Fim (opcional)" className="ui-input !w-[6.5rem] !py-1.5 text-sm" />
          </span>
          <input
            value={novo.titulo}
            onChange={(e) => setNovo({ ...novo, titulo: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
            maxLength={140}
            placeholder="O que fazer (ex.: Conferir publicações do dia)"
            aria-label="Novo item da rotina"
            className="ui-input min-w-48 flex-1 !py-1.5 text-sm"
          />
          <Repete valor={novo} onChange={(v) => setNovo({ ...novo, ...v })} />
          <button type="button" onClick={adicionar} disabled={!novo.titulo.trim() || pending} className="ui-btn px-3 py-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Horário é opcional. Sem fim, o item conta como atrasado 1 h depois do início. Repetição: escolha os dias da semana ou uma regra do mês (ex.: todo dia 5, 1º dia útil). O checklist se monta depois de adicionar (seta ao lado do item).
        </p>
      </div>

      {/* copiar de outra pessoa */}
      {pessoas.some((p) => p.id !== pessoa.id && p.temRotina) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Copiar a rotina de</span>
          <select value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} className="ui-input !w-auto !py-1.5 text-sm" aria-label="Copiar de">
            <option value="">escolher…</option>
            {pessoas
              .filter((p) => p.id !== pessoa.id && p.temRotina)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
          <button type="button" onClick={copiar} disabled={!copiarDe || pending} className="ui-btn-secondary px-3 py-1.5 text-xs">
            <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
          </button>
        </div>
      )}
    </div>
  );
}
