"use client";

import { useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { excluirRespostaRapidaAction, listarRespostasRapidasAction, salvarRespostaRapidaAction, type RespostaRapida } from "./respostas-actions";

// Mensagens rápidas (03/11/2026): lista que abre ao digitar "/" na conversa e a
// janela de criar/editar. A lista é a mesma para o escritório todo.

let cache: RespostaRapida[] | null = null;
const ouvintes = new Set<(r: RespostaRapida[]) => void>();
const publicar = (r: RespostaRapida[]) => {
  cache = r;
  ouvintes.forEach((f) => f(r));
};

/** Mensagens rápidas do escritório (carrega uma vez e fica em memória enquanto a página está aberta). */
export function useRespostasRapidas(): RespostaRapida[] {
  const [lista, setLista] = useState<RespostaRapida[]>(cache ?? []);
  useEffect(() => {
    ouvintes.add(setLista);
    if (!cache) void listarRespostasRapidasAction().then(publicar).catch(() => {});
    return () => void ouvintes.delete(setLista);
  }, []);
  return lista;
}

/** Troca {nome} pelo primeiro nome do contato. */
export const preencherResposta = (texto: string, nomeContato: string) => texto.replaceAll("{nome}", nomeContato.trim().split(/\s+/)[0] ?? "");

/** Filtra pelo que vem depois da barra: atalho que começa com o termo primeiro, depois o texto que contém. */
export function filtrarRespostas(lista: RespostaRapida[], termo: string): RespostaRapida[] {
  const t = termo.toLowerCase();
  const comeca = lista.filter((r) => r.atalho.startsWith(t));
  const contem = lista.filter((r) => !r.atalho.startsWith(t) && (r.atalho.includes(t) || r.texto.toLowerCase().includes(t)));
  return [...comeca, ...contem].slice(0, 8);
}

/** Lista que aparece em cima da caixa de escrever. */
export function SugestoesRespostas({
  itens,
  selecionado,
  onEscolher,
  onGerenciar,
  nomeContato,
}: {
  itens: RespostaRapida[];
  selecionado: number;
  onEscolher: (r: RespostaRapida) => void;
  onGerenciar: () => void;
  nomeContato: string;
}) {
  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-border bg-surface shadow-[0_12px_30px_-12px_rgba(15,26,42,0.35)]" role="listbox" aria-label="Mensagens rápidas">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="eyebrow flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5" aria-hidden /> Mensagens rápidas
        </span>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onGerenciar} className="text-xs font-medium text-navy-3 hover:underline">
          Criar e editar
        </button>
      </div>
      {itens.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted">Nenhuma mensagem com esse atalho. Use “Criar e editar” para montar as do escritório.</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto py-1">
          {itens.map((r, k) => (
            <li key={r.id}>
              <button
                type="button"
                role="option"
                aria-selected={k === selecionado}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onEscolher(r)}
                className={`flex w-full items-baseline gap-3 px-3 py-1.5 text-left ${k === selecionado ? "bg-hover" : "hover:bg-hover"}`}
              >
                <span className="shrink-0 font-mono text-xs font-semibold text-navy-3">/{r.atalho}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/85">{preencherResposta(r.texto, nomeContato)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-3 py-1 text-[11px] text-muted">↑↓ para escolher · Enter ou Tab para usar · Esc para fechar</p>
    </div>
  );
}

/** Janela para criar, editar e excluir as mensagens rápidas do escritório. */
export function GerenciarRespostas({ onFechar }: { onFechar: () => void }) {
  const lista = useRespostasRapidas();
  const [editando, setEditando] = useState<{ id?: string; atalho: string; texto: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (editando ? setEditando(null) : onFechar());
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [editando, onFechar]);

  function salvar() {
    if (!editando) return;
    start(async () => {
      const r = await salvarRespostaRapidaAction(editando);
      if (!r.ok || !r.resposta) return void toast.error(r.erro ?? "Não foi possível salvar.");
      const nova = editando.id ? lista.map((x) => (x.id === editando.id ? r.resposta! : x)) : [...lista, r.resposta];
      publicar(nova.sort((a, b) => a.atalho.localeCompare(b.atalho)));
      setEditando(null);
      toast.success(`/${r.resposta.atalho} salva.`);
    });
  }
  function excluir(r: RespostaRapida) {
    if (!confirm(`Excluir a mensagem rápida /${r.atalho}?`)) return;
    start(async () => {
      const x = await excluirRespostaRapidaAction(r.id);
      if (!x.ok) return void toast.error(x.erro);
      publicar(lista.filter((y) => y.id !== r.id));
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Mensagens rápidas" onClick={onFechar}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Zap className="h-4 w-4 text-navy-3" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Mensagens rápidas</p>
            <p className="text-xs text-muted">Do escritório todo. Na conversa, digite / e o atalho. {"{nome}"} vira o primeiro nome do contato.</p>
          </div>
          <button type="button" onClick={onFechar} className="icon-btn" aria-label="Fechar">
            <X aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {editando ? (
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted">Atalho</span>
                <span className="flex items-center gap-1">
                  <span className="font-mono text-sm text-muted">/</span>
                  <input autoFocus value={editando.atalho} onChange={(e) => setEditando({ ...editando, atalho: e.target.value })} maxLength={30} placeholder="bomdia" className="ui-input !py-1.5 font-mono text-sm" />
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted">Texto</span>
                <textarea
                  value={editando.texto}
                  onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
                  rows={6}
                  maxLength={4000}
                  placeholder="Bom dia, {nome}! Tudo bem? Aqui é da MC Advogados…"
                  className="ui-input text-sm"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditando(null)} className="ui-btn-secondary px-3 py-1.5 text-xs">
                  Cancelar
                </button>
                <button type="button" onClick={salvar} disabled={pending || !editando.atalho.trim() || !editando.texto.trim()} className="ui-btn px-3 py-1.5 text-xs">
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <>
              {lista.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border-strong p-5 text-center text-sm text-muted">Ainda não há mensagens rápidas. Crie a primeira (ex.: /bomdia, /documentos, /pix).</p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {lista.map((r) => (
                    <li key={r.id} className="flex items-start gap-2 px-3 py-2">
                      <span className="w-24 shrink-0 truncate pt-0.5 font-mono text-xs font-semibold text-navy-3">/{r.atalho}</span>
                      <span className="min-w-0 flex-1 text-sm whitespace-pre-wrap text-foreground/85">{r.texto}</span>
                      <button type="button" onClick={() => setEditando({ id: r.id, atalho: r.atalho, texto: r.texto })} className="icon-btn" aria-label={`Editar /${r.atalho}`} data-tip="Editar">
                        <Pencil aria-hidden />
                      </button>
                      <button type="button" onClick={() => excluir(r)} disabled={pending} className="icon-btn icon-btn-danger" aria-label={`Excluir /${r.atalho}`} data-tip="Excluir">
                        <Trash2 aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => setEditando({ atalho: "", texto: "" })} className="ui-btn mt-3 px-3 py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" aria-hidden /> Nova mensagem rápida
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
