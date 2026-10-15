"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Pencil, Send, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  apagarComentarioAction,
  comentarAction,
  editarComentarioAction,
  listarComentariosAction,
  type Comentario,
  type Membro,
} from "@/app/admin/activities/comentarios-actions";

// Comentários da atividade (só equipe). Digite @ para marcar alguém: a pessoa
// recebe aviso no sininho e no celular. Atualiza ao vivo.

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Texto com as menções (@Nome) destacadas. */
function TextoComMencoes({ texto, equipe }: { texto: string; equipe: Membro[] }) {
  const nomes = equipe.map((m) => m.nome).sort((a, b) => b.length - a.length);
  if (!nomes.length) return <>{texto}</>;
  const esc = nomes.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const partes = texto.split(new RegExp(`(@(?:${esc.join("|")}))`, "gi"));
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("@") && nomes.some((n) => p.toLowerCase() === `@${n.toLowerCase()}`) ? (
          <span key={i} className="rounded bg-navy/10 px-1 font-medium text-navy-3">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export function Comentarios({ activityId }: { activityId: string }) {
  const [supabase] = useState(() => createClient());
  const [lista, setLista] = useState<Comentario[] | null>(null);
  const [equipe, setEquipe] = useState<Membro[]>([]);
  const [meuId, setMeuId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [sugestao, setSugestao] = useState<{ termo: string; inicio: number } | null>(null);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof listarComentariosAction>>) => {
    if (!r.ok) return setErro(r.error);
    setLista(r.comentarios);
    setEquipe(r.equipe);
    setMeuId(r.meuId);
  }, []);
  const carregar = useCallback(async () => aplicar(await listarComentariosAction(activityId)), [activityId, aplicar]);

  useEffect(() => {
    let vivo = true;
    listarComentariosAction(activityId).then((r) => vivo && aplicar(r));
    const canal = supabase
      .channel(`comentarios-${activityId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_comments", filter: `activity_id=eq.${activityId}` }, () => void carregar())
      .subscribe();
    return () => {
      vivo = false;
      void supabase.removeChannel(canal);
    };
  }, [supabase, activityId, carregar, aplicar]);

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await comentarAction(activityId, t);
    setEnviando(false);
    if (!r.ok) return setErro(r.error ?? "Não foi possível comentar.");
    setTexto("");
    setSugestao(null);
    await carregar();
    fim.current?.scrollIntoView({ block: "nearest" });
  }

  async function salvarEdicao() {
    if (!editando) return;
    const r = await editarComentarioAction(editando.id, editando.texto);
    if (!r.ok) return setErro(r.error ?? "Não foi possível editar.");
    setEditando(null);
    await carregar();
  }

  async function apagar(id: string) {
    if (!confirm("Apagar este comentário?")) return;
    const r = await apagarComentarioAction(id);
    if (!r.ok) setErro(r.error ?? "Não foi possível apagar.");
    await carregar();
  }

  // @ digitado: mostra a lista de pessoas que combinam com o que vem depois
  function aoDigitar(valor: string, cursor: number) {
    setTexto(valor);
    const antes = valor.slice(0, cursor);
    const m = antes.match(/(?:^|\s)@([\p{L} ]{0,30})$/u);
    setSugestao(m ? { termo: m[1]!, inicio: cursor - m[1]!.length - 1 } : null);
  }
  const opcoes = sugestao
    ? equipe.filter((m) => m.id !== meuId && m.nome.toLowerCase().includes(sugestao.termo.trim().toLowerCase())).slice(0, 6)
    : [];
  function marcar(m: Membro) {
    if (!sugestao) return;
    const cursor = caixa.current?.selectionStart ?? texto.length;
    const novo = `${texto.slice(0, sugestao.inicio)}@${m.nome} ${texto.slice(cursor)}`;
    setTexto(novo);
    setSugestao(null);
    requestAnimationFrame(() => {
      const pos = sugestao.inicio + m.nome.length + 2;
      caixa.current?.focus();
      caixa.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="rounded-xl border border-border">
      <p className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-sm font-medium text-foreground">
        <MessageSquare className="h-4 w-4 text-muted" aria-hidden /> Comentários
        {lista && <span className="text-xs font-normal text-muted">({lista.length})</span>}
        <span className="ml-auto text-[11px] font-normal text-muted">só a equipe vê</span>
      </p>

      <ul className="max-h-80 space-y-3 overflow-y-auto px-4 py-3">
        {lista === null && !erro && <li className="text-sm text-muted">Carregando…</li>}
        {lista?.length === 0 && <li className="text-sm text-muted">Nenhum comentário ainda. Use @ para marcar alguém da equipe.</li>}
        {lista?.map((c) => {
          const meu = c.autor_id === meuId;
          return (
            <li key={c.id} className="group flex gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-2 text-[10px] font-semibold text-navy-foreground">
                {iniciais(c.autor)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <span className="font-semibold text-foreground">{c.autor}</span>
                  <span className="text-muted">
                    {quando(c.created_at)}
                    {c.editado_em ? " · editado" : ""}
                  </span>
                  {meu && editando?.id !== c.id && (
                    <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button type="button" onClick={() => setEditando({ id: c.id, texto: c.texto })} className="rounded p-0.5 text-muted hover:text-foreground" aria-label="Editar comentário">
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button type="button" onClick={() => void apagar(c.id)} className="rounded p-0.5 text-muted hover:text-status-danger" aria-label="Apagar comentário">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  )}
                </p>
                {editando?.id === c.id ? (
                  <div className="mt-1 space-y-1.5">
                    <textarea
                      value={editando.texto}
                      onChange={(e) => setEditando({ id: c.id, texto: e.target.value })}
                      rows={2}
                      className="ui-input text-sm"
                      aria-label="Editar comentário"
                      autoFocus
                    />
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => setEditando(null)} className="ui-btn-secondary px-2.5 py-1 text-xs">
                        Cancelar
                      </button>
                      <button type="button" onClick={() => void salvarEdicao()} className="ui-btn px-2.5 py-1 text-xs">
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
                    <TextoComMencoes texto={c.texto} equipe={equipe} />
                  </p>
                )}
              </div>
            </li>
          );
        })}
        <div ref={fim} />
      </ul>

      <div className="relative border-t border-border p-3">
        {opcoes.length > 0 && (
          <ul className="absolute bottom-full left-3 z-10 mb-1 w-64 overflow-hidden rounded-lg border border-border bg-surface shadow-lg" role="listbox">
            {opcoes.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    marcar(m);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-2 text-[10px] font-semibold text-navy-foreground">{iniciais(m.nome)}</span>
                  {m.nome}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={caixa}
            value={texto}
            onChange={(e) => aoDigitar(e.target.value, e.target.selectionStart)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && sugestao) {
                e.stopPropagation();
                setSugestao(null);
              }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void enviar();
              }
              if (e.key === "Enter" && !e.shiftKey && opcoes.length > 0) {
                e.preventDefault();
                marcar(opcoes[0]!);
              }
            }}
            rows={2}
            placeholder="Escreva um comentário… (@ para marcar alguém · Ctrl+Enter envia)"
            className="ui-input min-h-10 flex-1 resize-y text-sm"
            aria-label="Novo comentário"
          />
          <button type="button" onClick={() => void enviar()} disabled={!texto.trim() || enviando} className="ui-btn h-10 w-10 shrink-0 p-0" aria-label="Enviar comentário">
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {erro && <p className="mt-1.5 text-xs text-status-danger">{erro}</p>}
      </div>
    </div>
  );
}
