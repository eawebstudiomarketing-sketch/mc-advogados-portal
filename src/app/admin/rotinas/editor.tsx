"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { copiarRotinaAction, excluirItemRotinaAction, salvarItemRotinaAction } from "@/app/admin/rotina/actions";

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const NOMES_DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export type ItemEditor = { id: string; titulo: string; dias: number[]; hora_inicio: string | null; hora_fim: string | null; observacao: string | null };

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

function LinhaItem({ item, onSalvar, onExcluir }: { item: ItemEditor; onSalvar: (i: ItemEditor) => void; onExcluir: (i: ItemEditor) => void }) {
  const [obs, setObs] = useState(false);
  const salvarCampo = (parcial: Partial<ItemEditor>) => onSalvar({ ...item, ...parcial });
  return (
    <li className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
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
        <Dias dias={item.dias} onChange={(d) => salvarCampo({ dias: d })} />
        <button type="button" onClick={() => setObs((v) => !v)} className="icon-btn" aria-label="Observação" data-tip="Como fazer / observação">
          <ChevronDown className={obs ? "rotate-180" : ""} aria-hidden />
        </button>
        <button type="button" onClick={() => onExcluir(item)} className="icon-btn icon-btn-danger" aria-label={`Tirar ${item.titulo}`} data-tip="Tirar da rotina">
          <Trash2 aria-hidden />
        </button>
      </div>
      {(obs || item.observacao) && (
        <textarea
          defaultValue={item.observacao ?? ""}
          onBlur={(e) => e.target.value.trim() !== (item.observacao ?? "") && salvarCampo({ observacao: e.target.value.trim() || null })}
          rows={obs ? 3 : 1}
          maxLength={1000}
          placeholder="Como fazer, link, onde fica (opcional)"
          aria-label="Observação"
          className="ui-input mt-2 text-xs"
        />
      )}
    </li>
  );
}

/** Editor da rotina de uma pessoa (só o admin máximo vê esta tela de edição). */
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
  const [novo, setNovo] = useState({ titulo: "", inicio: "", fim: "", dias: [1, 2, 3, 4, 5] });
  const [copiarDe, setCopiarDe] = useState("");
  const [pending, start] = useTransition();
  const ordenar = (xs: ItemEditor[]) => [...xs].sort((a, b) => (a.hora_inicio ?? "99").localeCompare(b.hora_inicio ?? "99"));

  function salvar(item: ItemEditor) {
    setItens((xs) => ordenar(xs.map((x) => (x.id === item.id ? item : x))));
    start(async () => {
      const r = await salvarItemRotinaAction({
        id: item.id,
        responsavelId: pessoa.id,
        titulo: item.titulo,
        dias: item.dias,
        horaInicio: hhmm(item.hora_inicio) || null,
        horaFim: hhmm(item.hora_fim) || null,
        observacao: item.observacao,
      });
      if (!r.ok) {
        toast.error(r.erro);
        router.refresh();
      }
    });
  }
  function adicionar() {
    if (!novo.titulo.trim()) return;
    start(async () => {
      const r = await salvarItemRotinaAction({ responsavelId: pessoa.id, titulo: novo.titulo, dias: novo.dias, horaInicio: novo.inicio || null, horaFim: novo.fim || null });
      if (!r.ok || !r.id) return void toast.error(r.erro);
      setItens((xs) => ordenar([...xs, { id: r.id!, titulo: novo.titulo.trim(), dias: [...novo.dias], hora_inicio: novo.inicio || null, hora_fim: novo.fim || null, observacao: null }]));
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
        <ul className="space-y-2">
          {itens.map((i) => (
            <LinhaItem key={`${i.id}-${i.hora_inicio}-${i.hora_fim}`} item={i} onSalvar={salvar} onExcluir={excluir} />
          ))}
        </ul>
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
          <Dias dias={novo.dias} onChange={(d) => setNovo({ ...novo, dias: d })} />
          <button type="button" onClick={adicionar} disabled={!novo.titulo.trim() || pending} className="ui-btn px-3 py-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">Horário é opcional. Sem fim, o item conta como atrasado 1 h depois do início.</p>
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
