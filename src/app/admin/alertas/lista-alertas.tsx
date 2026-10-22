"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, CloudDownload, Newspaper, Star } from "lucide-react";
import { TextoAstrea } from "@/components/ui/texto-astrea";
import { descartarAlertasAndamentosAction, descartarAlertasPublicacoesAction, situacaoPublicacaoAction } from "./actions";

// Lista da aba (Publicações ou Andamentos) no padrão do Astrea: caixinha em cada
// alerta, "N alertas selecionados · Descartar alertas", "Expandir todos".

export type ItemAndamento = {
  processId: string;
  quando: string;
  titulo: string;
  numero: string;
  total: number;
  importantes: number;
  andamentos: { id: string; data: string; texto: string; importante: boolean; comentarios: number }[];
};

export type ItemPublicacao = {
  id: string;
  quando: string;
  diario: string;
  numero: string;
  nomePesquisado: string | null;
  texto: string;
};

const LINK = "text-[12px] font-semibold tracking-wide text-navy-3 uppercase hover:underline";

export function ListaAlertas(props: { aba: "andamentos"; itens: ItemAndamento[] } | { aba: "publicacoes"; itens: ItemPublicacao[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [abertos, setAbertos] = useState<string[]>([]);
  const chaves = props.aba === "andamentos" ? props.itens.map((i) => i.processId) : props.itens.map((i) => i.id);
  const todosAbertos = chaves.length > 0 && abertos.length === chaves.length;
  const alternar = (lista: string[], set: (v: string[]) => void, k: string) => set(lista.includes(k) ? lista.filter((x) => x !== k) : [...lista, k]);
  const acaoLote = props.aba === "andamentos" ? descartarAlertasAndamentosAction : descartarAlertasPublicacoesAction;
  const campo = props.aba === "andamentos" ? "process_id" : "id";

  return (
    <div className="space-y-3">
      <div className="ui-card flex flex-wrap items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          aria-label="Selecionar todos"
          className="h-4 w-4 accent-navy"
          checked={chaves.length > 0 && sel.length === chaves.length}
          onChange={(e) => setSel(e.target.checked ? chaves : [])}
        />
        {sel.length > 0 ? (
          <form action={acaoLote} onSubmit={() => setTimeout(() => setSel([]), 0)} className="flex items-center gap-4">
            {sel.map((k) => (
              <input key={k} type="hidden" name={campo} value={k} />
            ))}
            <span className="text-sm text-foreground">
              {sel.length} {sel.length === 1 ? "alerta selecionado" : "alertas selecionados"}
            </span>
            <button type="submit" className={LINK}>
              Descartar alertas
            </button>
          </form>
        ) : (
          <span className="text-sm text-muted">
            Mostrando {chaves.length} {chaves.length === 1 ? "alerta" : "alertas"}
          </span>
        )}
        <button type="button" onClick={() => setAbertos(todosAbertos ? [] : chaves)} className="ml-auto text-sm text-foreground/75 hover:text-foreground">
          {todosAbertos ? "Recolher todos" : "Expandir todos"}
        </button>
      </div>

      {chaves.length === 0 && <div className="ui-card px-5 py-12 text-center text-sm text-muted">Nenhum alerta aqui.</div>}

      {props.aba === "andamentos"
        ? props.itens.map((a) => {
            const aberto = abertos.includes(a.processId);
            return (
              <article key={a.processId} className="ui-card px-5 py-4">
                <div className="flex gap-3">
                  <input type="checkbox" aria-label={`Selecionar ${a.numero}`} className="mt-1 h-4 w-4 shrink-0 accent-navy" checked={sel.includes(a.processId)} onChange={() => alternar(sel, setSel, a.processId)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-[15px] text-foreground">
                        {a.importantes > 0 ? <Star className="h-4 w-4 fill-gold text-gold" aria-label="Importante" /> : <CloudDownload className="h-4 w-4 text-foreground/70" aria-hidden />}
                        Andamento recebido
                      </p>
                      <span className="shrink-0 text-sm text-foreground/80">{a.quando}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-foreground/90">{a.titulo}</p>
                    <p className="mt-0.5 text-sm text-muted">{a.numero}</p>
                    <p className="mt-0.5 text-sm text-foreground/85">
                      {a.total} andamento(s) encontrado(s){a.importantes > 0 ? ` - ${a.importantes} importante(s)` : ""}
                    </p>

                    {aberto && (
                      <ul className="mt-3 space-y-2">
                        {a.andamentos.map((x) => (
                          <li key={x.id} className={`flex gap-4 rounded-lg px-4 py-3 text-sm ${x.importante ? "bg-gold/15" : "bg-surface-2"}`}>
                            <span className="w-20 shrink-0 text-xs text-muted">{x.data}</span>
                            {x.importante ? <Star className="mt-0.5 h-4 w-4 shrink-0 fill-gold text-gold" aria-label="Importante" /> : <CloudDownload className="mt-0.5 h-4 w-4 shrink-0 text-navy-3" aria-hidden />}
                            <div className="min-w-0">
                              <TextoAstrea texto={x.texto} corrido className="text-foreground/90" />
                              {x.comentarios > 0 && (
                                <Link href={`/admin/alertas/andamentos/${a.processId}#and-${x.id}`} className="mt-1 block text-xs text-navy-3 hover:underline">
                                  {x.comentarios} comentário{x.comentarios === 1 ? "" : "s"}
                                </Link>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <Link href={`/admin/alertas/andamentos/${a.processId}`} className={LINK}>
                        Tratar andamentos
                      </Link>
                      <Link href={`/admin/processes/${a.processId}#andamentos`} className={LINK}>
                        Ver processo
                      </Link>
                      <button type="button" onClick={() => alternar(abertos, setAbertos, a.processId)} className={`${LINK} inline-flex items-center gap-1`}>
                        {aberto ? "Ocultar andamentos" : "Exibir andamentos"} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden />
                      </button>
                      <form action={descartarAlertasAndamentosAction} className="ml-auto">
                        <input type="hidden" name="process_id" value={a.processId} />
                        <button type="submit" className="text-[12px] font-semibold tracking-wide text-foreground/70 uppercase hover:text-foreground">
                          Descartar alerta
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        : props.itens.map((p) => {
            const aberto = abertos.includes(p.id);
            return (
              <article key={p.id} className="ui-card px-5 py-4">
                <div className="flex gap-3">
                  <input type="checkbox" aria-label={`Selecionar ${p.numero}`} className="mt-1 h-4 w-4 shrink-0 accent-navy" checked={sel.includes(p.id)} onChange={() => alternar(sel, setSel, p.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] text-foreground">
                        <Newspaper className="h-4 w-4 text-foreground/70" aria-hidden />
                        Publicação recebida
                        <span className="rounded bg-status-pending-bg px-1.5 py-px text-[10px] font-bold tracking-wide text-status-pending uppercase">Não tratada</span>
                      </p>
                      <span className="shrink-0 text-sm text-foreground/80">{p.quando}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-foreground/90">
                      {p.diario} - Processo {p.numero}
                    </p>
                    {p.nomePesquisado && <p className="mt-0.5 text-sm text-muted">{p.nomePesquisado}</p>}
                    {aberto && (
                      <p className="mt-3 max-h-[28rem] overflow-y-auto rounded-lg bg-surface-2 p-3 text-sm text-foreground/85">
                        <TextoAstrea texto={p.texto} />
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <Link href={`/admin/alertas/publicacao/${p.id}`} className={LINK}>
                        Tratar publicação
                      </Link>
                      <form action={situacaoPublicacaoAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="status" value="descartada" />
                        <button type="submit" className={LINK}>
                          Descartar publicação
                        </button>
                      </form>
                      <button type="button" onClick={() => alternar(abertos, setAbertos, p.id)} className={LINK}>
                        {aberto ? "Recolher" : "Expandir"}
                      </button>
                      <form action={descartarAlertasPublicacoesAction} className="ml-auto">
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="text-[12px] font-semibold tracking-wide text-foreground/70 uppercase hover:text-foreground">
                          Descartar alerta
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
    </div>
  );
}
