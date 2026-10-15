"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AtSign, Bell, CheckCheck, Hash, ListChecks, Loader2, MessageSquare, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Aviso, ChatMensagem, Pessoa, ResumoConversa } from "@/lib/data/mensagens";
import { carregarMensagensAction, enviarMensagemInternaAction, marcarAvisosLidosAction, marcarConversaLidaAction } from "./actions";

// Mensagens internas: canal Escritório (todo mundo), conversas 1:1 e avisos.
// Tudo ao vivo pelo Supabase Realtime (o banco só entrega o que a pessoa pode ver).

const GERAL = "geral";
const AVISOS = "avisos";
const conversaCom = (eu: string, outro: string) => `dm:${[eu, outro].sort().join(":")}`;

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

function quando(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const diaDe = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
};

const ICONE_AVISO: Record<string, typeof Bell> = { mencao: AtSign, comentario: MessageSquare, responsavel: ListChecks };

export function MensagensApp({
  eu,
  equipe,
  resumoInicial,
  avisosIniciais,
  abrirInicial,
  mensagensIniciais,
}: {
  eu: { id: string; nome: string };
  equipe: Pessoa[];
  resumoInicial: ResumoConversa[];
  avisosIniciais: Aviso[];
  abrirInicial: string | null;
  /** mensagens da conversa pedida no link (?c=), já carregadas no servidor */
  mensagensIniciais: ChatMensagem[];
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [resumo, setResumo] = useState(() => new Map(resumoInicial.map((r) => [r.conversa, r])));
  const [avisos, setAvisos] = useState(avisosIniciais);
  const [aberta, setAberta] = useState<string | null>(abrirInicial);
  const [mensagens, setMensagens] = useState<ChatMensagem[]>(mensagensIniciais);
  const [carregando, setCarregando] = useState(false);
  const abertaRef = useRef(aberta);
  useEffect(() => {
    abertaRef.current = aberta;
  }, [aberta]);

  const nomeDe = useMemo(() => new Map([[eu.id, eu.nome], ...equipe.map((p) => [p.id, p.nome] as const)]), [eu, equipe]);
  const avisosNaoLidos = avisos.filter((a) => !a.lido_em).length;

  const abrir = useCallback(
    async (conversa: string) => {
      abertaRef.current = conversa;
      setAberta(conversa);
      router.replace(`/admin/mensagens?c=${encodeURIComponent(conversa)}`, { scroll: false });
      if (conversa === AVISOS) return;
      setMensagens([]);
      setCarregando(true);
      const ms = await carregarMensagensAction(conversa);
      if (abertaRef.current !== conversa) return;
      setMensagens(ms);
      setCarregando(false);
      setResumo((r) => new Map(r).set(conversa, { ...(r.get(conversa) ?? { conversa, ultima: null }), naoLidas: 0 }));
      void marcarConversaLidaAction(conversa);
    },
    [router]
  );

  // tempo real: mensagens novas e avisos novos
  useEffect(() => {
    const canal = supabase
      .channel("mensagens-internas")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_mensagens" }, (p) => {
        const m = p.new as ChatMensagem;
        const naConversa = m.conversa === abertaRef.current;
        if (naConversa) {
          setMensagens((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m]));
          if (m.autor_id !== eu.id) void marcarConversaLidaAction(m.conversa);
        }
        setResumo((r) => {
          const atual = r.get(m.conversa) ?? { conversa: m.conversa, ultima: null, naoLidas: 0 };
          const somar = !naConversa && m.autor_id !== eu.id;
          return new Map(r).set(m.conversa, { conversa: m.conversa, ultima: m, naoLidas: atual.naoLidas + (somar ? 1 : 0) });
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "avisos" }, (p) => {
        const a = p.new as Aviso;
        setAvisos((as) => (as.some((x) => x.id === a.id) ? as : [a, ...as]));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, eu.id]);

  // lista: Avisos, canal Escritório e as pessoas (quem conversou por último em cima)
  const pessoas = useMemo(
    () =>
      [...equipe].sort((a, b) => {
        const ua = resumo.get(conversaCom(eu.id, a.id))?.ultima?.created_at ?? "";
        const ub = resumo.get(conversaCom(eu.id, b.id))?.ultima?.created_at ?? "";
        return ub.localeCompare(ua) || a.nome.localeCompare(b.nome);
      }),
    [equipe, resumo, eu.id]
  );

  const tituloAberta =
    aberta === AVISOS ? "Avisos" : aberta === GERAL ? "Escritório" : aberta ? nomeDe.get(aberta.slice(3).split(":").find((id) => id !== eu.id) ?? "") ?? "Conversa" : "";

  return (
    <div className="ui-card flex h-[calc(100dvh-13rem)] min-h-[460px] overflow-hidden p-0">
      <aside className={`${aberta ? "hidden md:flex" : "flex"} w-full flex-col border-r border-border md:w-72`}>
        <ul className="flex-1 overflow-y-auto py-1">
          <ItemLista
            ativo={aberta === AVISOS}
            onClick={() => void abrir(AVISOS)}
            icone={<Bell className="h-4 w-4" aria-hidden />}
            nome="Avisos"
            previa={avisos[0]?.titulo ?? "Marcações, comentários e atividades suas"}
            quando={avisos[0] ? quando(avisos[0].created_at) : ""}
            naoLidas={avisosNaoLidos}
            destaque
          />
          <ItemLista
            ativo={aberta === GERAL}
            onClick={() => void abrir(GERAL)}
            icone={<Hash className="h-4 w-4" aria-hidden />}
            nome="Escritório"
            previa={previaDe(resumo.get(GERAL)?.ultima, nomeDe, eu.id) ?? "Canal com toda a equipe"}
            quando={resumo.get(GERAL)?.ultima ? quando(resumo.get(GERAL)!.ultima!.created_at) : ""}
            naoLidas={resumo.get(GERAL)?.naoLidas ?? 0}
          />
          <li className="px-4 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">Equipe</li>
          {pessoas.length === 0 && <li className="px-4 py-2 text-sm text-muted">Ninguém mais na equipe ainda.</li>}
          {pessoas.map((p) => {
            const c = conversaCom(eu.id, p.id);
            const r = resumo.get(c);
            return (
              <ItemLista
                key={p.id}
                ativo={aberta === c}
                onClick={() => void abrir(c)}
                icone={<span className="text-[11px] font-semibold">{iniciais(p.nome)}</span>}
                nome={p.nome}
                previa={previaDe(r?.ultima, nomeDe, eu.id) ?? (p.role === "admin" ? "Administrador" : "Advogado")}
                quando={r?.ultima ? quando(r.ultima.created_at) : ""}
                naoLidas={r?.naoLidas ?? 0}
              />
            );
          })}
        </ul>
      </aside>

      <section className={`${aberta ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-surface-2/40`}>
        {!aberta ? (
          <div className="m-auto max-w-xs p-6 text-center text-sm text-muted">
            <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted/60" aria-hidden />
            Escolha uma conversa, o canal Escritório ou os seus avisos.
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2.5">
              <button type="button" onClick={() => setAberta(null)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 md:hidden" aria-label="Voltar">
                <ArrowLeft className="h-5 w-5" aria-hidden />
              </button>
              <p className="flex-1 truncate text-sm font-semibold text-foreground">{tituloAberta}</p>
              {aberta === AVISOS && avisosNaoLidos > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    void marcarAvisosLidosAction();
                    setAvisos((as) => as.map((a) => ({ ...a, lido_em: a.lido_em ?? new Date().toISOString() })));
                  }}
                  className="ui-btn-secondary px-3 py-1.5 text-xs"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Marcar todos como lidos
                </button>
              )}
            </header>

            {aberta === AVISOS ? (
              <ListaAvisos
                avisos={avisos}
                abrir={(a) => {
                  if (!a.lido_em) {
                    void marcarAvisosLidosAction([a.id]);
                    setAvisos((as) => as.map((x) => (x.id === a.id ? { ...x, lido_em: new Date().toISOString() } : x)));
                  }
                  if (a.url) router.push(a.url);
                }}
              />
            ) : (
              <Conversa key={aberta} conversa={aberta} mensagens={mensagens} carregando={carregando} eu={eu.id} nomeDe={nomeDe} grupo={aberta === GERAL} />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function previaDe(m: ChatMensagem | null | undefined, nomeDe: Map<string, string>, eu: string): string | null {
  if (!m) return null;
  const quem = m.autor_id === eu ? "Você" : (nomeDe.get(m.autor_id) ?? "").split(" ")[0];
  return `${quem}: ${m.texto}`;
}

function ItemLista({
  ativo,
  onClick,
  icone,
  nome,
  previa,
  quando: hora,
  naoLidas,
  destaque,
}: {
  ativo: boolean;
  onClick: () => void;
  icone: React.ReactNode;
  nome: string;
  previa: string;
  quando: string;
  naoLidas: number;
  destaque?: boolean;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2 ${ativo ? "bg-surface-2" : ""}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${destaque ? "bg-gold-soft text-gold-ink" : "bg-navy-2 text-navy-foreground"}`}>{icone}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`truncate text-sm ${naoLidas ? "font-semibold" : ""} text-foreground`}>{nome}</span>
            <span className={`ml-auto shrink-0 text-[11px] ${naoLidas ? "font-semibold text-navy-3" : "text-muted"}`}>{hora}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="truncate text-xs text-muted">{previa}</span>
            {naoLidas > 0 && (
              <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-navy px-1.5 text-[11px] font-semibold text-navy-foreground">
                {naoLidas > 99 ? "99+" : naoLidas}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

function ListaAvisos({ avisos, abrir }: { avisos: Aviso[]; abrir: (a: Aviso) => void }) {
  if (!avisos.length) return <p className="m-auto p-6 text-center text-sm text-muted">Nenhum aviso por enquanto.</p>;
  return (
    <ul className="flex-1 divide-y divide-border overflow-y-auto bg-surface">
      {avisos.map((a) => {
        const Icone = ICONE_AVISO[a.tipo] ?? Bell;
        return (
          <li key={a.id}>
            <button type="button" onClick={() => abrir(a)} className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2 ${a.lido_em ? "" : "bg-navy/[0.04]"}`}>
              <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${a.lido_em ? "text-muted" : "text-navy-3"}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${a.lido_em ? "text-foreground" : "font-semibold text-foreground"}`}>{a.titulo}</span>
                {a.corpo && <span className="mt-0.5 block truncate text-xs text-muted">{a.corpo}</span>}
              </span>
              <span className="shrink-0 text-[11px] text-muted">{quando(a.created_at)}</span>
              {!a.lido_em && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-navy" aria-label="Não lido" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Conversa({
  conversa,
  mensagens,
  carregando,
  eu,
  nomeDe,
  grupo,
}: {
  conversa: string;
  mensagens: ChatMensagem[];
  carregando: boolean;
  eu: string;
  nomeDe: Map<string, string>;
  grupo: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const ultima = mensagens[mensagens.length - 1]?.id;

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [ultima]);

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await enviarMensagemInternaAction(conversa, t);
    setEnviando(false);
    if (!r.ok) setErro(r.error ?? "Não foi possível enviar.");
    else setTexto("");
  }

  return (
    <>
      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-6">
        {carregando && (
          <div className="flex justify-center py-8 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" />
          </div>
        )}
        {!carregando && mensagens.length === 0 && <p className="py-8 text-center text-sm text-muted">Nenhuma mensagem ainda. Diga oi!</p>}
        {mensagens.map((m, i) => {
          const minha = m.autor_id === eu;
          const dia = diaDe(m.created_at);
          const separador = i === 0 || dia !== diaDe(mensagens[i - 1]!.created_at);
          const mesmoAutor = !separador && mensagens[i - 1]!.autor_id === m.autor_id;
          return (
            <div key={m.id}>
              {separador && (
                <div className="my-3 text-center">
                  <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-muted shadow-sm">{dia}</span>
                </div>
              )}
              <div className={`flex ${minha ? "justify-end" : "justify-start"} ${mesmoAutor ? "" : "mt-2"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm shadow-sm sm:max-w-[70%] ${
                    minha ? "rounded-br-md bg-navy text-navy-foreground" : "rounded-bl-md bg-surface text-foreground"
                  }`}
                >
                  {grupo && !minha && !mesmoAutor && <p className="text-[11px] font-semibold text-gold-ink">{nomeDe.get(m.autor_id) ?? "Alguém da equipe"}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  <p className={`mt-0.5 text-right text-[10px] ${minha ? "text-navy-foreground/60" : "text-muted"}`}>
                    {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={fim} />
      </div>
      <footer className="border-t border-border bg-surface p-2.5">
        {erro && <p className="mb-2 px-1 text-xs text-status-danger">{erro}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            rows={1}
            placeholder={grupo ? "Mensagem para toda a equipe (Enter envia)" : "Escreva uma mensagem (Enter envia, Shift+Enter quebra linha)"}
            className="ui-input max-h-40 min-h-10 flex-1 resize-none py-2"
            aria-label="Mensagem"
          />
          <button type="button" onClick={() => void enviar()} disabled={!texto.trim() || enviando} className="ui-btn h-10 w-10 shrink-0 p-0" aria-label="Enviar">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </footer>
    </>
  );
}
