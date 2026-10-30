"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { atribuirModeloAction, excluirModeloAction, salvarModeloAction } from "./relatorio-actions";
import { SECAO_ROTULO, SECOES, TIPO_ROTULO, TIPOS, type Modelo, type Secao, type TipoPergunta } from "@/lib/rotina-relatorio/tipos";

// Modelos de pergunta do relatório do dia (só o admin máximo). Cada pessoa usa
// um modelo; editar o modelo não mexe nos relatórios já enviados.

type Linha = { chave: string; id: string | null; secao: Secao; tipo: TipoPergunta; texto: string; opcoes: string; obrigatoria: boolean };
type Pessoa = { id: string; nome: string; foto: string | null; modeloId: string | null };

const nova = (secao: Secao = "pessoal"): Linha => ({ chave: crypto.randomUUID(), id: null, secao, tipo: "texto_longo", texto: "", opcoes: "", obrigatoria: true });
const deModelo = (m: Modelo): Linha[] =>
  m.perguntas.filter((p) => p.ativa).map((p) => ({ chave: p.id, id: p.id, secao: p.secao, tipo: p.tipo, texto: p.texto, opcoes: p.opcoes.join("\n"), obrigatoria: p.obrigatoria }));

export function EditorModelos({ modelos, pessoas }: { modelos: Modelo[]; pessoas: Pessoa[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [escolhido, setEscolhido] = useState<string | "novo">(modelos[0]?.id ?? "novo");
  const atual = modelos.find((m) => m.id === escolhido) ?? null;
  const [nome, setNome] = useState(atual?.nome ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(atual ? deModelo(atual) : [nova()]);

  function abrir(id: string | "novo") {
    setEscolhido(id);
    const m = modelos.find((x) => x.id === id);
    setNome(m?.nome ?? "");
    setLinhas(m ? deModelo(m) : [nova()]);
  }
  const mudar = (chave: string, parte: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...parte } : l)));
  const mover = (i: number, d: -1 | 1) =>
    setLinhas((ls) => {
      const j = i + d;
      if (j < 0 || j >= ls.length) return ls;
      const c = [...ls];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  function salvar() {
    start(async () => {
      const r = await salvarModeloAction({
        id: atual?.id ?? null,
        nome,
        perguntas: linhas.map((l) => ({
          id: l.id ?? undefined,
          secao: l.secao,
          tipo: l.tipo,
          texto: l.texto,
          opcoes: l.tipo === "escolha" || l.tipo === "multipla" ? l.opcoes.split("\n") : [],
          obrigatoria: l.obrigatoria,
        })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Modelo salvo.");
      if (r.id) setEscolhido(r.id);
      router.refresh();
    });
  }
  function apagar() {
    if (!atual || !confirm(`Excluir o modelo "${atual.nome}"? Quem usa fica sem modelo. Os relatórios já enviados não mudam.`)) return;
    start(async () => {
      const r = await excluirModeloAction(atual.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Modelo excluído.");
      abrir("novo");
      router.refresh();
    });
  }
  function atribuir(responsavelId: string, modeloId: string) {
    start(async () => {
      const r = await atribuirModeloAction(responsavelId, modeloId || null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* quem usa qual modelo */}
      <div className="ui-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Quem usa qual modelo</h3>
        <p className="mt-0.5 mb-3 text-xs text-muted">Quem não tem modelo não vê o relatório do dia. Cada pessoa tem um só.</p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pessoas.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5">
              <Avatar nome={p.nome} foto={p.foto} tamanho={26} />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{p.nome}</span>
              <select aria-label={`Modelo de ${p.nome}`} value={p.modeloId ?? ""} onChange={(e) => atribuir(p.id, e.target.value)} disabled={pending} className="ui-input !w-44 !py-1.5 text-sm">
                <option value="">Sem relatório</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>

      {/* escolha do modelo */}
      <div className="flex flex-wrap gap-2">
        {modelos.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => abrir(m.id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${escolhido === m.id ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/80 hover:border-border-strong"}`}
          >
            {m.nome}
          </button>
        ))}
        <button type="button" onClick={() => abrir("novo")} className={`inline-flex items-center gap-1.5 rounded-full border border-dashed px-3.5 py-1.5 text-sm ${escolhido === "novo" ? "border-navy text-navy" : "border-border-strong text-muted hover:text-foreground"}`}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Novo modelo
        </button>
      </div>

      {/* editor do modelo */}
      <div className="ui-card space-y-4 p-4 sm:p-5">
        <div>
          <label htmlFor="modelo-nome" className="ui-label">
            Nome do modelo
          </label>
          <input id="modelo-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Ex.: Equipe jurídica, Maurício…" className="ui-input" />
        </div>

        {SECOES.map((s) => {
          const daSecao = linhas.map((l, i) => ({ l, i })).filter(({ l }) => l.secao === s);
          return (
            <div key={s} className="space-y-3 rounded-xl border border-border p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="eyebrow">{SECAO_ROTULO[s].titulo}</h4>
                  <p className="text-xs text-muted">{SECAO_ROTULO[s].ajuda}</p>
                </div>
                <button type="button" onClick={() => setLinhas((ls) => [...ls, nova(s)])} className="ui-btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Pergunta
                </button>
              </div>
              {daSecao.length === 0 && <p className="text-xs text-muted">Nenhuma pergunta nesta seção.</p>}
              {daSecao.map(({ l, i }) => (
                <div key={l.chave} className="space-y-2 rounded-lg bg-surface-2/50 p-3">
                  <textarea
                    aria-label="Texto da pergunta"
                    value={l.texto}
                    onChange={(e) => mudar(l.chave, { texto: e.target.value })}
                    rows={2}
                    maxLength={500}
                    placeholder="Escreva a pergunta"
                    className="ui-input w-full resize-y text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label="Tipo de resposta" value={l.tipo} onChange={(e) => mudar(l.chave, { tipo: e.target.value as TipoPergunta })} className="ui-input !w-44 !py-1.5 text-sm">
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {TIPO_ROTULO[t]}
                        </option>
                      ))}
                    </select>
                    <select aria-label="Seção" value={l.secao} onChange={(e) => mudar(l.chave, { secao: e.target.value as Secao })} className="ui-input !w-44 !py-1.5 text-sm">
                      {SECOES.map((x) => (
                        <option key={x} value={x}>
                          {SECAO_ROTULO[x].titulo}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-foreground/80">
                      <input type="checkbox" checked={l.obrigatoria} onChange={(e) => mudar(l.chave, { obrigatoria: e.target.checked })} className="h-4 w-4 accent-[var(--navy)]" /> Obrigatória
                    </label>
                    <span className="flex-1" />
                    <button type="button" onClick={() => mover(i, -1)} className="icon-btn" aria-label="Subir" data-tip="Subir">
                      <ArrowUp aria-hidden />
                    </button>
                    <button type="button" onClick={() => mover(i, 1)} className="icon-btn" aria-label="Descer" data-tip="Descer">
                      <ArrowDown aria-hidden />
                    </button>
                    <button type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))} className="icon-btn" aria-label="Remover pergunta" data-tip="Remover">
                      <Trash2 aria-hidden />
                    </button>
                  </div>
                  {(l.tipo === "escolha" || l.tipo === "multipla") && (
                    <textarea
                      aria-label="Opções, uma por linha"
                      value={l.opcoes}
                      onChange={(e) => mudar(l.chave, { opcoes: e.target.value })}
                      rows={3}
                      placeholder={"Uma opção por linha\nEx.: Sim\nParcialmente\nNão"}
                      className="ui-input w-full resize-y text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
          );
        })}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={salvar} disabled={pending || !nome.trim()} className="ui-btn px-5 py-2.5 text-sm">
            {pending ? "Salvando…" : "Salvar modelo"}
          </button>
          {atual && (
            <button type="button" onClick={apagar} disabled={pending} className="ui-btn-secondary px-4 py-2.5 text-sm">
              Excluir modelo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
