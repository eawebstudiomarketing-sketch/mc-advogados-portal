"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2, Undo2 } from "lucide-react";
import { TIPOS_PERGUNTA, type Pergunta, type Secao, type TipoPergunta } from "@/lib/regimentos/tipos";
import { editarComIAAction, salvarQuestionarioAction } from "../actions";

// Aba "Perguntas" (o editor do Google Forms): título, objetivo, seções e
// perguntas editáveis à mão, mais o "Editar com IA" (pedido em texto). Nada
// vai para a empresa até clicar em Salvar.

const novoId = () => Math.random().toString(36).slice(2, 10);
const mover = <T,>(l: T[], i: number, d: -1 | 1) => {
  const j = i + d;
  if (j < 0 || j >= l.length) return l;
  const c = [...l];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
};

export function EditorPerguntas({ id, titulo: t0, descricao: d0, secoes: s0, temRespostas }: { id: string; titulo: string; descricao: string; secoes: Secao[]; temRespostas: boolean }) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(t0);
  const [descricao, setDescricao] = useState(d0);
  const [secoes, setSecoes] = useState<Secao[]>(s0);
  const [antes, setAntes] = useState<{ descricao: string; secoes: Secao[] } | null>(null);
  const [pedido, setPedido] = useState("");
  const [sujo, setSujo] = useState(false);
  const [salvando, startSalvar] = useTransition();
  const [ia, startIA] = useTransition();

  const mudarSecoes = (f: (s: Secao[]) => Secao[]) => {
    setSecoes(f);
    setSujo(true);
  };
  const mudarPergunta = (si: number, pi: number, p: Partial<Pergunta>) =>
    mudarSecoes((ss) => ss.map((s, i) => (i !== si ? s : { ...s, perguntas: s.perguntas.map((q, j) => (j !== pi ? q : { ...q, ...p })) })));

  function salvar() {
    startSalvar(async () => {
      const r = await salvarQuestionarioAction(id, { titulo, descricao, secoes });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Questionário salvo");
      setSujo(false);
      setAntes(null);
      router.refresh();
    });
  }

  const campo = "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm";
  return (
    <div className="space-y-4">
      {temRespostas && <p className="rounded-lg bg-status-pending-bg px-4 py-2.5 text-sm text-status-pending">A empresa já começou a responder. Mudar ou apagar perguntas agora pode deixar respostas sem pergunta.</p>}

      <section className="ui-card space-y-2 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-navy-3" aria-hidden /> Editar com IA
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            placeholder='Ex.: "tira a seção de montagem", "acrescenta perguntas sobre delivery", "deixa mais curto"'
            className={`${campo} flex-1`}
          />
          <button
            type="button"
            disabled={ia || !pedido.trim()}
            onClick={() =>
              startIA(async () => {
                const r = await editarComIAAction(id, pedido);
                if (!r.ok) return void toast.error(r.error);
                setAntes({ descricao, secoes });
                setDescricao(r.descricao);
                setSecoes(r.secoes);
                setSujo(true);
                setPedido("");
                toast.success("Pronto. Revise e clique em Salvar (ou Desfazer).");
              })
            }
            className="ui-btn"
          >
            {ia && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Aplicar
          </button>
          {antes && (
            <button
              type="button"
              onClick={() => {
                setDescricao(antes.descricao);
                setSecoes(antes.secoes);
                setAntes(null);
              }}
              className="ui-btn-secondary"
            >
              <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
            </button>
          )}
        </div>
        <p className="text-xs text-muted">A IA parte do questionário que está na tela (com as suas edições já salvas).</p>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="h-2.5 bg-navy" />
        <div className="space-y-3 p-5">
          <input value={titulo} onChange={(e) => (setTitulo(e.target.value), setSujo(true))} aria-label="Título do formulário" className="w-full border-0 border-b border-border bg-transparent px-0 py-1 text-xl font-semibold focus:border-navy focus:ring-0 focus:outline-none" />
          <textarea value={descricao} onChange={(e) => (setDescricao(e.target.value), setSujo(true))} rows={4} aria-label="Descrição do formulário" placeholder="Objetivo do questionário" className={campo} />
        </div>
      </section>

      {secoes.map((s, si) => (
        <section key={s.id} className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex items-center gap-2 bg-navy px-4 py-2 text-xs font-semibold text-white">
              Seção {si + 1} de {secoes.length}
              <span className="ml-auto flex gap-1">
                <button type="button" aria-label="Subir seção" onClick={() => mudarSecoes((ss) => mover(ss, si, -1))} className="rounded p-1 hover:bg-white/15">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Descer seção" onClick={() => mudarSecoes((ss) => mover(ss, si, 1))} className="rounded p-1 hover:bg-white/15">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Apagar seção"
                  onClick={() => window.confirm(`Apagar a seção "${s.titulo}" e as ${s.perguntas.length} perguntas dela?`) && mudarSecoes((ss) => ss.filter((_, i) => i !== si))}
                  className="rounded p-1 hover:bg-white/15"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
            <div className="space-y-2 p-4">
              <input value={s.titulo} onChange={(e) => mudarSecoes((ss) => ss.map((x, i) => (i === si ? { ...x, titulo: e.target.value } : x)))} aria-label="Título da seção" className={`${campo} font-semibold`} />
              <input value={s.descricao ?? ""} onChange={(e) => mudarSecoes((ss) => ss.map((x, i) => (i === si ? { ...x, descricao: e.target.value } : x)))} placeholder="Descrição da seção (opcional)" aria-label="Descrição da seção" className={campo} />
            </div>
          </div>

          {s.perguntas.map((p, pi) => (
            <div key={p.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <textarea value={p.texto} rows={1} onChange={(e) => mudarPergunta(si, pi, { texto: e.target.value })} aria-label="Pergunta" className={`${campo} flex-1 resize-y`} />
                <select
                  value={p.tipo}
                  onChange={(e) => {
                    const tipo = e.target.value as TipoPergunta;
                    const comOpcoes = tipo === "multipla" || tipo === "caixas";
                    mudarPergunta(si, pi, { tipo, opcoes: comOpcoes ? (p.opcoes?.length ? p.opcoes : ["Sim", "Não"]) : undefined });
                  }}
                  aria-label="Tipo da pergunta"
                  className={`${campo} sm:w-48`}
                >
                  {TIPOS_PERGUNTA.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              {(p.tipo === "multipla" || p.tipo === "caixas") && (
                <div className="mt-2 space-y-1.5 pl-1">
                  {(p.opcoes ?? []).map((o, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <span className={`h-3.5 w-3.5 shrink-0 border border-border-strong ${p.tipo === "multipla" ? "rounded-full" : "rounded-sm"}`} aria-hidden />
                      <input
                        value={o}
                        onChange={(e) => mudarPergunta(si, pi, { opcoes: (p.opcoes ?? []).map((x, k) => (k === oi ? e.target.value : x)) })}
                        aria-label={`Opção ${oi + 1}`}
                        className={`${campo} max-w-md`}
                      />
                      <button type="button" aria-label="Apagar opção" onClick={() => mudarPergunta(si, pi, { opcoes: (p.opcoes ?? []).filter((_, k) => k !== oi) })} className="text-muted hover:text-status-danger">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-4 pt-1 text-sm">
                    <button type="button" onClick={() => mudarPergunta(si, pi, { opcoes: [...(p.opcoes ?? []), `Opção ${(p.opcoes?.length ?? 0) + 1}`] })} className="text-navy-3 hover:underline">
                      Adicionar opção
                    </button>
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" checked={!!p.outro} onChange={(e) => mudarPergunta(si, pi, { outro: e.target.checked })} /> Opção &quot;Outro&quot;
                    </label>
                  </div>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-2.5 text-xs text-muted">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={!!p.obrigatoria} onChange={(e) => mudarPergunta(si, pi, { obrigatoria: e.target.checked })} /> Obrigatória
                </label>
                <span className="ml-auto flex gap-1">
                  <button type="button" aria-label="Subir pergunta" onClick={() => mudarSecoes((ss) => ss.map((x, i) => (i === si ? { ...x, perguntas: mover(x.perguntas, pi, -1) } : x)))} className="rounded p-1 hover:bg-surface-2">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Descer pergunta" onClick={() => mudarSecoes((ss) => ss.map((x, i) => (i === si ? { ...x, perguntas: mover(x.perguntas, pi, 1) } : x)))} className="rounded p-1 hover:bg-surface-2">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Apagar pergunta" onClick={() => mudarSecoes((ss) => ss.map((x, i) => (i === si ? { ...x, perguntas: x.perguntas.filter((_, j) => j !== pi) } : x)))} className="rounded p-1 hover:bg-surface-2 hover:text-status-danger">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => mudarSecoes((ss) => ss.map((x, i) => (i === si ? { ...x, perguntas: [...x.perguntas, { id: novoId(), tipo: "paragrafo", texto: "Nova pergunta" }] } : x)))}
            className="ui-btn-secondary"
          >
            <Plus className="h-4 w-4" aria-hidden /> Pergunta nesta seção
          </button>
        </section>
      ))}

      <button type="button" onClick={() => mudarSecoes((ss) => [...ss, { id: novoId(), titulo: `SEÇÃO ${ss.length + 1} – NOVA SEÇÃO`, descricao: null, perguntas: [] }])} className="ui-btn-secondary">
        <Plus className="h-4 w-4" aria-hidden /> Nova seção
      </button>

      {/* barra fixa de salvar */}
      <div className={`sticky bottom-4 z-20 flex items-center gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur transition-opacity ${sujo ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <span className="text-sm text-foreground">Alterações não salvas</span>
        <button type="button" onClick={salvar} disabled={salvando} className="ui-btn ml-auto">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Salvar
        </button>
      </div>
    </div>
  );
}
