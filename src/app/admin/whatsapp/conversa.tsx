"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowLeft,
  AudioLines,
  Ban,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Copy,
  CornerUpLeft,
  Download,
  FileText,
  Forward,
  Loader2,
  Mic,
  MoreVertical,
  Paperclip,
  Pencil,
  Pin,
  Search,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { WaChat, WaMensagem } from "@/lib/whatsapp";
import {
  buscarNaConversaAction,
  carregarConversaAction,
  enviarArquivoAction,
  enviarMensagemAction,
  marcarLidoAction,
  mensagensEmVoltaAction,
  prepararMensagemAction,
  prepararUploadAction,
} from "./actions";
import { executarOrdem } from "./ordem";
import { AvatarWa } from "./comum";
import { EMOJIS_RAPIDOS, dataHoraCompleta, diaChave, diaCompleto, telefone, tamanhoLegivel } from "./util";

const POR_PAGINA = 60;
const EDITAR_ATE_MS = 15 * 60_000; // o WhatsApp deixa editar por 15 min
const APAGAR_ATE_MS = 60 * 3600_000; // e apagar pra todos por ~60 h

type Msg = WaMensagem & { _temp?: boolean; _arquivo?: string };
type Reacoes = Record<string, string>;

const reacoesDe = (m: Msg): Reacoes => (m.reacoes && typeof m.reacoes === "object" && !Array.isArray(m.reacoes) ? (m.reacoes as Reacoes) : {});

export function Conversa({
  chat,
  nomes,
  fotos,
  ligado,
  conversas,
  onVoltar,
  onPerfil,
  onAjustar,
}: {
  chat: WaChat;
  nomes: Map<string, string>;
  /** foto de perfil de cada número (conversas 1:1 que já existem) */
  fotos: Map<string, string | null>;
  ligado: boolean;
  conversas: WaChat[];
  onVoltar: () => void;
  onPerfil: () => void;
  onAjustar: (acao: "fixar" | "arquivar" | "silenciar" | "lida", valor: boolean) => void;
}) {
  const jid = chat.chat_jid;
  const nome = chat.nome || telefone(jid);
  const [supabase] = useState(() => createClient());
  const [mensagens, setMensagens] = useState<Msg[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [temMais, setTemMais] = useState(false);
  const [temNovas, setTemNovas] = useState(false);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [respondendo, setRespondendo] = useState<Msg | null>(null);
  const [editando, setEditando] = useState<Msg | null>(null);
  const [encaminhando, setEncaminhando] = useState<Msg | null>(null);
  const [ampliada, setAmpliada] = useState<Msg | null>(null);
  const [menuChat, setMenuChat] = useState(false);
  const [busca, setBusca] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Awaited<ReturnType<typeof buscarNaConversaAction>>>([]);
  const [novasAbaixo, setNovasAbaixo] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const rolagemRef = useRef<HTMLDivElement>(null);
  // cartãozinho da data que aparece enquanto rola (igual ao WhatsApp)
  const [pilula, setPilula] = useState<string | null>(null);
  const pilulaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const temNovasRef = useRef(false);
  const posRef = useRef<{ primeiro?: string; ultimo?: string; altura: number; topo: number; perto: boolean }>({ altura: 0, topo: 0, perto: true });
  useEffect(() => {
    temNovasRef.current = temNovas;
  }, [temNovas]);

  /* ───── carregar ───── */
  const carregarRecentes = useCallback(async () => {
    setCarregando(true);
    try {
      const ms = await carregarConversaAction(jid);
      setMensagens(ms);
      setTemMais(ms.length >= POR_PAGINA);
      setTemNovas(false);
      posRef.current = { altura: 0, topo: 0, perto: true, ultimo: undefined, primeiro: undefined };
    } finally {
      setCarregando(false);
    }
  }, [jid]);

  useEffect(() => {
    const t = setTimeout(() => {
      void carregarRecentes();
      void marcarLidoAction(jid);
    }, 0);
    return () => clearTimeout(t);
  }, [jid, carregarRecentes]);

  /* ───── tempo real só desta conversa ───── */
  useEffect(() => {
    const canal = supabase
      .channel(`wa-conversa-${jid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_messages", filter: `chat_jid=eq.${jid}` }, async (p) => {
        if (p.eventType === "DELETE") return;
        const bruta = p.new as Msg;
        // só precisa ir ao servidor quando tem mídia (link assinado)
        const m: Msg = bruta.media_path ? await prepararMensagemAction(bruta) : { ...bruta, raw: undefined, media_pendente: !!bruta.raw && !bruta.media_erro };
        setMensagens((ms) => {
          // o WhatsApp às vezes devolve a enviada antes do Agente gravar o job_id:
          // aí ela chega como INSERT sem job e o job vem num UPDATE depois
          const semTempDoJob = (xs: Msg[]) => (m.job_id ? xs.filter((x) => !(x._temp && x.job_id === m.job_id)) : xs);
          const i = ms.findIndex((x) => x.id === m.id);
          if (i >= 0) {
            const copia = [...ms];
            copia[i] = { ...copia[i], ...m };
            return semTempDoJob(copia);
          }
          if (temNovasRef.current) return ms; // olhando mensagens antigas: não empurra
          return [...semTempDoJob(ms), m].sort((a, b) => a.wa_timestamp.localeCompare(b.wa_timestamp));
        });
        if (!m.from_me && p.eventType === "INSERT") void marcarLidoAction(jid);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase, jid]);

  /* ───── rolagem ───── */
  const primeiroId = mensagens[0]?.id;
  const ultimoId = mensagens[mensagens.length - 1]?.id;

  useLayoutEffect(() => {
    const el = rolagemRef.current;
    if (!el) return;
    const a = posRef.current;
    if (destaque) {
      el.querySelector(`[data-msg="${destaque}"]`)?.scrollIntoView({ block: "center" });
    } else if (!a.ultimo) {
      el.scrollTop = el.scrollHeight;
    } else if (primeiroId !== a.primeiro && ultimoId === a.ultimo) {
      el.scrollTop = el.scrollHeight - a.altura + a.topo; // carregou antigas em cima
    } else if (ultimoId !== a.ultimo) {
      if (a.perto) el.scrollTop = el.scrollHeight;
      else setNovasAbaixo(true);
    }
    posRef.current = { primeiro: primeiroId, ultimo: ultimoId, altura: el.scrollHeight, topo: el.scrollTop, perto: a.perto };
  }, [primeiroId, ultimoId, destaque]);

  const aoCarregarMidia = useCallback(() => {
    const el = rolagemRef.current;
    if (el && posRef.current.perto && !temNovasRef.current) el.scrollTop = el.scrollHeight;
  }, []);

  const buscandoRef = useRef(false);
  async function aoRolar() {
    const el = rolagemRef.current;
    if (!el) return;
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    posRef.current = { ...posRef.current, altura: el.scrollHeight, topo: el.scrollTop, perto };
    // data da primeira mensagem visível no topo
    const linhas = el.querySelectorAll<HTMLElement>("[data-dia]");
    let diaTopo: string | null = null;
    for (const n of linhas) {
      if (n.offsetTop + n.offsetHeight > el.scrollTop + 12) {
        diaTopo = n.dataset.dia ?? null;
        break;
      }
    }
    if (diaTopo) {
      setPilula(diaTopo);
      if (pilulaTimer.current) clearTimeout(pilulaTimer.current);
      pilulaTimer.current = setTimeout(() => setPilula(null), 1600);
    }
    if (perto) setNovasAbaixo(false);
    if (buscandoRef.current || carregando) return;
    if (el.scrollTop < 200 && temMais && mensagens.length) {
      buscandoRef.current = true;
      try {
        const antigas = await carregarConversaAction(jid, mensagens[0].wa_timestamp);
        setTemMais(antigas.length >= POR_PAGINA);
        posRef.current = { ...posRef.current, altura: el.scrollHeight, topo: el.scrollTop };
        setMensagens((ms) => [...antigas.filter((a) => !ms.some((m) => m.id === a.id)), ...ms]);
      } finally {
        buscandoRef.current = false;
      }
    } else if (perto && temNovas && mensagens.length) {
      buscandoRef.current = true;
      try {
        const novas = await carregarConversaAction(jid, undefined, mensagens[mensagens.length - 1].wa_timestamp);
        setTemNovas(novas.length >= POR_PAGINA);
        setMensagens((ms) => [...ms, ...novas.filter((a) => !ms.some((m) => m.id === a.id))]);
      } finally {
        buscandoRef.current = false;
      }
    }
  }

  function irProFim() {
    if (temNovas) {
      setDestaque(null);
      void carregarRecentes();
      return;
    }
    const el = rolagemRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setNovasAbaixo(false);
  }

  /** Vai até uma mensagem (busca ou citação), carregando em volta se precisar. */
  const pularPara = useCallback(
    async (alvo: { id?: string; waId?: string; ts?: string }) => {
      const achada = mensagens.find((m) => (alvo.id && m.id === alvo.id) || (alvo.waId && m.wa_id === alvo.waId));
      if (achada) {
        setDestaque(achada.id);
        setTimeout(() => setDestaque(null), 2200);
        return;
      }
      let ts = alvo.ts;
      let alvoId = alvo.id;
      if (!ts && alvo.waId) {
        const { data } = await supabase.from("wa_messages").select("id, wa_timestamp").eq("wa_id", alvo.waId).maybeSingle();
        if (!data) return void toast.info("A mensagem citada não está guardada no portal.");
        ts = data.wa_timestamp;
        alvoId = data.id;
      }
      if (!ts) return;
      const r = await mensagensEmVoltaAction(jid, ts);
      posRef.current = { altura: 0, topo: 0, perto: false, ultimo: "x", primeiro: "x" };
      setMensagens(r.msgs);
      setTemMais(true);
      setTemNovas(r.temNovas);
      const id = alvoId ?? r.msgs.find((m) => m.wa_timestamp === ts)?.id ?? null;
      setDestaque(id);
      setTimeout(() => setDestaque(null), 2200);
    },
    [mensagens, jid, supabase]
  );

  /* ───── busca na conversa ───── */
  const buscaValida = busca !== null && busca.trim().length >= 2;
  useEffect(() => {
    if (!buscaValida) return;
    const t = setTimeout(async () => setResultados(await buscarNaConversaAction(jid, busca!)), 300);
    return () => clearTimeout(t);
  }, [busca, buscaValida, jid]);
  const resultadosVisiveis = buscaValida ? resultados : [];

  /* ───── ações em mensagens ───── */
  async function ordem(tipo: string, payload: Record<string, unknown>, ok?: string) {
    const r = await executarOrdem(tipo, payload);
    if (!r.ok) toast.error(r.erro ?? "Não deu certo.");
    else if (ok) toast.success(ok);
    return r.ok;
  }

  const reagir = useCallback(
    async (m: Msg, emoji: string) => {
      if (!m.wa_id) return;
      const atual = reacoesDe(m).eu;
      const novo = atual === emoji ? "" : emoji;
      setMensagens((ms) =>
        ms.map((x) => {
          if (x.id !== m.id) return x;
          const r = { ...reacoesDe(x) };
          if (novo) r.eu = novo;
          else delete r.eu;
          return { ...x, reacoes: r };
        })
      );
      await ordem("reagir", { chat_jid: jid, wa_id: m.wa_id, emoji: novo });
    },
    [jid]
  );

  const apagar = useCallback(
    async (m: Msg) => {
      if (!m.wa_id || !confirm("Apagar esta mensagem para todos? Ela some do WhatsApp de todo mundo (no portal fica guardada, marcada como apagada).")) return;
      await ordem("apagar_para_todos", { chat_jid: jid, wa_id: m.wa_id }, "Mensagem apagada para todos.");
    },
    [jid]
  );

  const acoes = useMemo(
    () => ({
      responder: (m: Msg) => {
        setEditando(null);
        setRespondendo(m);
        document.getElementById("wa-texto")?.focus();
      },
      reagir,
      copiar: (m: Msg) => {
        void navigator.clipboard.writeText(m.texto ?? "");
        toast.success("Copiado.");
      },
      encaminhar: (m: Msg) => setEncaminhando(m),
      editar: (m: Msg) => {
        setRespondendo(null);
        setEditando(m);
      },
      apagar,
      ampliar: (m: Msg) => setAmpliada(m),
      citar: (waId: string) => void pularPara({ waId }),
    }),
    [reagir, apagar, pularPara]
  );

  /* ───── enviar ───── */
  const contadorTemp = useRef(0);
  function temporaria(extra: Partial<Msg>): Msg {
    contadorTemp.current += 1;
    return {
      id: `tmp-${contadorTemp.current}`,
      chat_jid: jid,
      wa_id: null,
      from_me: true,
      quem: "humano",
      tipo: "texto",
      texto: null,
      status: "enviando",
      wa_timestamp: new Date().toISOString(),
      reacoes: {},
      encaminhada: false,
      resposta_a: respondendo?.wa_id ?? null,
      resposta_texto: respondendo ? respondendo.texto ?? respondendo.media_nome ?? null : null,
      resposta_de: respondendo ? (respondendo.from_me ? "eu" : respondendo.sender_jid) : null,
      _temp: true,
      ...extra,
    } as Msg;
  }

  async function enviarTexto(texto: string) {
    if (editando) {
      const alvo = editando;
      setEditando(null);
      setMensagens((ms) => ms.map((x) => (x.id === alvo.id ? { ...x, texto, editada_em: new Date().toISOString() } : x)));
      await ordem("editar", { chat_jid: jid, wa_id: alvo.wa_id, texto });
      return;
    }
    const resp = respondendo;
    const temp = temporaria({ texto });
    posRef.current.perto = true;
    setMensagens((ms) => [...ms, temp]);
    setRespondendo(null);
    const r = await enviarMensagemAction(jid, texto, resp?.wa_id);
    if (!r.ok) {
      setMensagens((ms) => ms.map((x) => (x.id === temp.id ? { ...x, status: "erro", erro: r.erro ?? "Não enviou" } : x)));
      toast.error(r.erro ?? "Não foi possível enviar.");
    } else setMensagens((ms) => ms.map((x) => (x.id === temp.id ? { ...x, job_id: r.jobId ?? null } : x)));
  }

  async function enviarArquivos(arquivos: File[], legenda = "", ptt = false) {
    const resp = respondendo;
    setRespondendo(null);
    for (const [i, f] of arquivos.entries()) {
      const tipo = ptt ? "audio" : f.type.startsWith("image/") ? "imagem" : f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "audio" : "documento";
      const local = URL.createObjectURL(f);
      const temp = temporaria({ tipo, texto: i === 0 ? legenda || null : null, media_nome: f.name, media_mime: f.type || null, media_url: local, _arquivo: f.name });
      posRef.current.perto = true;
      setMensagens((ms) => [...ms, temp]);
      try {
        const up = await prepararUploadAction(f.name);
        if (!up.ok || !up.path || !up.token) throw new Error(up.erro ?? "Não preparou o envio.");
        const { error } = await supabase.storage.from("whatsapp").uploadToSignedUrl(up.path, up.token, f, { contentType: f.type || "application/octet-stream" });
        if (error) throw new Error(error.message.includes("size") ? "Arquivo grande demais para o envio." : "Falha ao subir o arquivo.");
        const r = await enviarArquivoAction(jid, {
          path: up.path,
          mime: f.type || "application/octet-stream",
          nome: f.name,
          texto: i === 0 ? legenda : "",
          ptt,
          responderA: i === 0 ? resp?.wa_id : null,
        });
        if (!r.ok) throw new Error(r.erro);
        setMensagens((ms) => ms.map((x) => (x.id === temp.id ? { ...x, job_id: r.jobId ?? null } : x)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Não enviou.";
        setMensagens((ms) => ms.map((x) => (x.id === temp.id ? { ...x, status: "erro", erro: msg } : x)));
        toast.error(`${f.name}: ${msg}`);
      }
    }
  }

  const chatsParaEncaminhar = conversas;

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setArrastando(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastando(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        const fs = Array.from(e.dataTransfer.files);
        if (fs.length) void enviarArquivos(fs);
      }}
    >
      {/* cabeçalho */}
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <button type="button" onClick={onVoltar} className="icon-btn md:hidden" aria-label="Voltar para as conversas">
          <ArrowLeft aria-hidden />
        </button>
        <button type="button" onClick={onPerfil} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left hover:bg-surface-2">
          <AvatarWa nome={nome} grupo={chat.is_group} foto={chat.foto_url} />
          <span className="min-w-0 leading-tight">
            <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
              {nome}
              {chat.fixado && <Pin className="h-3 w-3 text-muted" aria-label="Fixada" />}
            </span>
            <span className="block truncate text-xs text-muted">{chat.is_group ? "Toque para ver os participantes" : telefone(jid)}</span>
          </span>
        </button>
        <button type="button" onClick={() => setBusca((b) => (b === null ? "" : null))} className="icon-btn" aria-label="Buscar na conversa" data-tip="Buscar">
          <Search aria-hidden />
        </button>
        <div className="relative">
          <button type="button" onClick={() => setMenuChat((v) => !v)} className="icon-btn" aria-label="Mais opções" aria-expanded={menuChat}>
            <MoreVertical aria-hidden />
          </button>
          {menuChat && (
            <Menu onFechar={() => setMenuChat(false)} className="right-0 top-10">
              <ItemMenu onClick={onPerfil}>{chat.is_group ? "Dados do grupo" : "Dados do contato"}</ItemMenu>
              <ItemMenu onClick={() => onAjustar("fixar", !chat.fixado)}>{chat.fixado ? "Desafixar conversa" : "Fixar conversa"}</ItemMenu>
              <ItemMenu onClick={() => onAjustar("silenciar", !chat.silenciado)}>{chat.silenciado ? "Reativar notificações" : "Silenciar (8 h)"}</ItemMenu>
              <ItemMenu onClick={() => onAjustar("lida", false)}>Marcar como não lida</ItemMenu>
              <ItemMenu onClick={() => onAjustar("arquivar", !chat.arquivado)}>{chat.arquivado ? "Desarquivar" : "Arquivar conversa"}</ItemMenu>
            </Menu>
          )}
        </div>
      </header>

      {busca !== null && (
        <div className="border-b border-border bg-surface px-3 py-2">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar mensagens nesta conversa"
              className="ui-input !py-1.5 text-sm"
              aria-label="Buscar mensagens"
            />
            <button type="button" onClick={() => setBusca(null)} className="icon-btn" aria-label="Fechar busca">
              <X aria-hidden />
            </button>
          </div>
          {resultadosVisiveis.length > 0 && (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border">
              {resultadosVisiveis.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void pularPara({ id: r.id, ts: r.wa_timestamp })}
                    className="flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <span className="shrink-0 text-[11px] text-muted">{new Date(r.wa_timestamp).toLocaleDateString("pt-BR")}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {r.from_me ? "Você: " : ""}
                      {r.texto}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {buscaValida && resultadosVisiveis.length === 0 && <p className="mt-2 text-xs text-muted">Nada encontrado.</p>}
        </div>
      )}

      {/* mensagens */}
      <div className="relative min-h-0 flex-1">
        {pilula && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center" aria-hidden>
            <span className="rounded-lg bg-surface/95 px-3 py-1 text-[11px] font-medium capitalize text-foreground shadow-md ring-1 ring-border">{pilula}</span>
          </div>
        )}
        <div ref={rolagemRef} onScroll={() => void aoRolar()} className="wa-fundo h-full overflow-y-auto overscroll-contain px-3 py-3 sm:px-[6%]">
          {temMais && !carregando && (
            <div className="flex justify-center pb-2 text-muted">
              <Loader2 className="h-4 w-4 animate-spin opacity-60" aria-label="Carregando anteriores" />
            </div>
          )}
          {carregando && (
            <div className="flex justify-center py-10 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" />
            </div>
          )}
          {!carregando && mensagens.length === 0 && <p className="py-10 text-center text-sm text-muted">Nenhuma mensagem guardada nesta conversa ainda.</p>}
          {mensagens.map((m, i) => {
            const dia = diaCompleto(m.wa_timestamp);
            const separador = i === 0 || diaChave(m.wa_timestamp) !== diaChave(mensagens[i - 1].wa_timestamp);
            const seguida = !separador && i > 0 && mensagens[i - 1].from_me === m.from_me && mensagens[i - 1].sender_jid === m.sender_jid;
            return (
              <div key={m.id} data-msg={m.id} data-dia={dia} className="[contain-intrinsic-size:auto_64px] [content-visibility:auto]">
                {separador && (
                  <div className="my-3 text-center">
                    <span className="rounded-lg bg-surface px-3 py-1 text-[11px] font-medium capitalize text-muted shadow-sm">{dia}</span>
                  </div>
                )}
                <Balao m={m} grupo={chat.is_group} nomes={nomes} fotos={fotos} seguida={seguida} destaque={destaque === m.id} acoes={acoes} onCarregou={aoCarregarMidia} />
              </div>
            );
          })}
          {temNovas && (
            <div className="flex justify-center pt-2 text-muted">
              <Loader2 className="h-4 w-4 animate-spin opacity-60" aria-label="Carregando mais novas" />
            </div>
          )}
        </div>
        {(novasAbaixo || temNovas) && (
          <button
            type="button"
            onClick={irProFim}
            className="absolute right-4 bottom-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-foreground shadow-md ring-1 ring-border hover:bg-surface-2"
            aria-label="Ir para as mensagens mais recentes"
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
        )}
        {arrastando && (
          <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-2xl border-2 border-dashed border-navy-3 bg-surface/80 text-sm font-medium text-foreground">
            Solte para enviar
          </div>
        )}
      </div>

      <Compositor
        key={`${jid}-${editando?.id ?? ""}`}
        ligado={ligado}
        respondendo={respondendo}
        editando={editando}
        nomeDe={(m) => (m.from_me ? "Você" : (m.sender_jid && nomes.get(m.sender_jid)) || nome)}
        onCancelar={() => {
          setRespondendo(null);
          setEditando(null);
        }}
        onTexto={(t) => void enviarTexto(t)}
        onArquivos={(fs, legenda, ptt) => void enviarArquivos(fs, legenda, ptt)}
      />

      {ampliada && (ampliada.tipo === "documento" ? <VerDocumento m={ampliada} onFechar={() => setAmpliada(null)} /> : <Ampliada m={ampliada} onFechar={() => setAmpliada(null)} />)}
      {encaminhando && (
        <Encaminhar
          m={encaminhando}
          conversas={chatsParaEncaminhar}
          onFechar={() => setEncaminhando(null)}
          onEnviar={async (para) => {
            setEncaminhando(null);
            const r = await executarOrdem("encaminhar", { wa_id: encaminhando.wa_id, para, chat_jid: jid }, { esperar: false });
            if (r.ok) toast.success(`Encaminhando para ${para.length} conversa(s).`);
            else toast.error(r.erro ?? "Não deu certo.");
          }}
        />
      )}
    </div>
  );
}

/* ───────── menu simples ───────── */

/**
 * Menu suspenso. Com `ancora` (retângulo do botão que abriu), abre FLUTUANDO
 * por cima de tudo (portal no body): dentro da lista virtual ou de caixas com
 * rolagem ele ficava por baixo das outras linhas / cortado.
 */
export function Menu({
  children,
  onFechar,
  className = "",
  ancora,
}: {
  children: React.ReactNode;
  onFechar: () => void;
  className?: string;
  ancora?: DOMRect | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onFechar();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    const t = setTimeout(() => document.addEventListener("mousedown", fora), 0);
    document.addEventListener("keydown", esc);
    if (ancora) window.addEventListener("scroll", onFechar, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", onFechar, true);
    };
  }, [onFechar, ancora]);
  useLayoutEffect(() => {
    if (!ancora || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(ancora.right - width, window.innerWidth - width - 8));
    const embaixo = ancora.bottom + 4;
    const top = embaixo + height > window.innerHeight - 8 ? Math.max(8, ancora.top - height - 4) : embaixo;
    setPos({ top, left });
  }, [ancora]);
  const caixa = (
    <div
      ref={ref}
      role="menu"
      style={ancora ? { position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999 } : undefined}
      className={`${ancora ? "z-[60]" : "absolute z-30"} min-w-52 rounded-xl border border-border bg-surface py-1 shadow-lg ${ancora ? "" : className}`}
    >
      {children}
    </div>
  );
  return ancora ? createPortal(caixa, document.body) : caixa;
}

export function ItemMenu({ children, onClick, perigo = false }: { children: React.ReactNode; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-surface-2 ${perigo ? "text-status-danger" : "text-foreground"}`}
    >
      {children}
    </button>
  );
}

/* ───────── balão ───────── */

type Acoes = {
  responder: (m: Msg) => void;
  reagir: (m: Msg, emoji: string) => void;
  copiar: (m: Msg) => void;
  encaminhar: (m: Msg) => void;
  editar: (m: Msg) => void;
  apagar: (m: Msg) => void;
  ampliar: (m: Msg) => void;
  citar: (waId: string) => void;
};

// cores dos nomes no grupo (como no WhatsApp: cada pessoa uma cor)
const CORES_NOME = ["#e542a3", "#1f7aec", "#d3396d", "#02a698", "#ff8f2c", "#7f66ff", "#35b84b", "#c0732f", "#5e47de", "#dd4c3b"];
const corDoNome = (jid: string) => {
  let h = 0;
  for (const c of jid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES_NOME[h % CORES_NOME.length];
};

const Balao = memo(function Balao({
  m,
  grupo,
  nomes,
  fotos,
  seguida,
  destaque,
  acoes,
  onCarregou,
}: {
  m: Msg;
  grupo: boolean;
  nomes: Map<string, string>;
  fotos: Map<string, string | null>;
  seguida: boolean;
  destaque: boolean;
  acoes: Acoes;
  onCarregou: () => void;
}) {
  const meu = m.from_me;
  const hora = new Date(m.wa_timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  // nome de quem mandou no grupo: agenda → "~nome do perfil" → telefone
  const sender = m.sender_jid && !m.sender_jid.endsWith("@g.us") ? m.sender_jid : null;
  const remetente =
    grupo && !meu && !seguida
      ? (sender && nomes.get(sender)) || (m.sender_nome ? `~${m.sender_nome}` : sender ? telefone(sender) : null)
      : null;
  const mostraFoto = grupo && !meu;
  const [verOriginal, setVerOriginal] = useState(false);
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const [emojis, setEmojis] = useState<DOMRect | null>(null);
  const [agora] = useState(() => Date.now());
  const idade = agora - Date.parse(m.wa_timestamp);
  const podeEditar = meu && m.tipo === "texto" && !!m.wa_id && !m.apagada_em && idade < EDITAR_ATE_MS;
  const podeApagar = meu && !!m.wa_id && !m.apagada_em && idade < APAGAR_ATE_MS;
  const reacoes = Object.values(reacoesDe(m));
  const contagem = reacoes.reduce<Record<string, number>>((acc, e) => ((acc[e] = (acc[e] ?? 0) + 1), acc), {});
  const autorCitada = m.resposta_de === "eu" ? "Você" : m.resposta_de ? nomes.get(m.resposta_de) || telefone(m.resposta_de) : null;

  return (
    <div className={`group/msg flex items-start gap-2 ${meu ? "justify-end" : "justify-start"} ${seguida ? "mt-0.5" : "mt-2"}`}>
      {mostraFoto &&
        (seguida ? (
          <span className="w-8 shrink-0" aria-hidden />
        ) : (
          <span className="mt-0.5 shrink-0" title={remetente ?? undefined}>
            <AvatarWa nome={(sender && nomes.get(sender)) || m.sender_nome || "?"} grupo={false} foto={sender ? fotos.get(sender) : null} tamanho="h-8 w-8" />
          </span>
        ))}
      <div className={`relative max-w-[85%] sm:max-w-[65%] ${reacoes.length ? "mb-3" : ""}`}>
        <div
          onDoubleClick={() => !m._temp && acoes.responder(m)}
          className={`rounded-2xl px-2.5 py-1.5 text-[14px] leading-snug shadow-sm transition-shadow ${meu ? "rounded-tr-md bg-bolha text-bolha-ink" : "wa-entrada rounded-tl-md"} ${
            m.apagada_em ? "ring-1 ring-status-danger/30" : ""
          } ${destaque ? "ring-2 ring-gold" : ""}`}
        >
          {remetente && (
            <p className="mb-0.5 truncate text-[12.5px] font-semibold" style={{ color: sender ? corDoNome(sender) : undefined }}>
              {remetente}
            </p>
          )}
          {m.encaminhada && (
            <p className="mb-0.5 flex items-center gap-1 text-[11px] italic opacity-70">
              <Forward className="h-3 w-3" aria-hidden /> Encaminhada
            </p>
          )}
          {m.resposta_a && (
            <button
              type="button"
              onClick={() => acoes.citar(m.resposta_a!)}
              className="mb-1 block w-full rounded-lg border-l-4 border-gold bg-black/5 px-2 py-1 text-left text-[12px] hover:bg-black/10"
            >
              {autorCitada && <span className="block font-semibold text-gold-ink">{autorCitada}</span>}
              <span className="line-clamp-2 opacity-80">{m.resposta_texto || "Mensagem"}</span>
            </button>
          )}
          <Midia m={m} onAmpliar={acoes.ampliar} onCarregou={onCarregou} />
          {m.texto && (
            <p className="break-words whitespace-pre-wrap">
              {verOriginal && m.texto_original ? m.texto_original : m.texto}
              <span className={`inline-block ${m.editada_em || m.apagada_em || (meu && m.quem === "ia") ? "w-32" : "w-16"}`} aria-hidden />
            </p>
          )}
          <p className={`${m.texto ? "-mt-3.5" : "mt-0.5"} flex flex-wrap items-center justify-end gap-1 text-[10px] ${meu ? "opacity-70" : "text-muted"}`}>
            {m.apagada_em && (
              <span className="inline-flex items-center gap-0.5 rounded bg-status-danger/10 px-1 font-medium text-status-danger" title="Apagada no WhatsApp. O portal guardou a original.">
                <Ban className="h-3 w-3" aria-hidden /> apagada
              </span>
            )}
            {m.editada_em && (
              <button
                type="button"
                onClick={() => setVerOriginal((v) => !v)}
                className="rounded bg-black/5 px-1 hover:bg-black/10"
                title={m.texto_original ? `Original: ${m.texto_original}` : "Editada"}
              >
                {verOriginal ? "ver atual" : "editada"}
              </button>
            )}
            {meu && m.quem === "ia" && (
              <span className="inline-flex items-center gap-0.5 rounded bg-black/10 px-1" title="Enviada pela IA do portal">
                <Bot className="h-3 w-3" aria-hidden /> IA
              </span>
            )}
            <span title={dataHoraCompleta(m.wa_timestamp)}>{hora}</span>
            {meu && <StatusEnvio status={m.status} erro={m.erro} />}
          </p>
        </div>

        {reacoes.length > 0 && (
          <div className={`absolute -bottom-3 ${meu ? "right-2" : "left-2"} flex items-center gap-0.5 rounded-full border border-border bg-surface px-1.5 py-px text-[12px] shadow-sm`}>
            {Object.entries(contagem).map(([e, n]) => (
              <span key={e}>
                {e}
                {n > 1 ? <span className="ml-0.5 text-[10px] text-muted">{n}</span> : null}
              </span>
            ))}
          </div>
        )}

        {/* ações: aparecem ao passar o mouse */}
        {!m._temp && (
          <div className={`absolute top-1 ${meu ? "-left-16" : "-right-16"} flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 ${menu || emojis ? "opacity-100" : ""}`}>
            <button type="button" onClick={(e) => setEmojis((v) => (v ? null : e.currentTarget.getBoundingClientRect()))} className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted shadow-sm ring-1 ring-border hover:text-foreground" aria-label="Reagir">
              <Smile className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button type="button" onClick={(e) => setMenu((v) => (v ? null : e.currentTarget.getBoundingClientRect()))} className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-muted shadow-sm ring-1 ring-border hover:text-foreground" aria-label="Opções da mensagem">
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
        {emojis && (
          <Menu onFechar={() => setEmojis(null)} ancora={emojis}>
            <div className="flex gap-1 px-2">
            {EMOJIS_RAPIDOS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setEmojis(null);
                  acoes.reagir(m, e);
                }}
                className={`rounded-full p-1 text-lg transition-transform hover:scale-125 ${reacoesDe(m).eu === e ? "bg-surface-2" : ""}`}
                aria-label={`Reagir com ${e}`}
              >
                {e}
              </button>
            ))}
            </div>
          </Menu>
        )}
        {menu && (
          <Menu onFechar={() => setMenu(null)} ancora={menu}>
            <ItemMenu onClick={() => (setMenu(null), acoes.responder(m))}>
              <CornerUpLeft className="h-4 w-4 text-muted" aria-hidden /> Responder
            </ItemMenu>
            {m.texto && (
              <ItemMenu onClick={() => (setMenu(null), acoes.copiar(m))}>
                <Copy className="h-4 w-4 text-muted" aria-hidden /> Copiar
              </ItemMenu>
            )}
            <ItemMenu onClick={() => (setMenu(null), acoes.encaminhar(m))}>
              <Forward className="h-4 w-4 text-muted" aria-hidden /> Encaminhar
            </ItemMenu>
            {(m.media_download_url || m.media_url) && (
              <ItemMenu onClick={() => (setMenu(null), window.open(m.media_download_url ?? m.media_url!, "_blank"))}>
                <Download className="h-4 w-4 text-muted" aria-hidden /> Baixar
              </ItemMenu>
            )}
            {m.media_url && (m.tipo === "audio" || m.tipo === "video" || /^(audio|video)\//.test(m.media_mime ?? "")) && (
              // abre em outra aba: a conversa continua aberta aqui
              <ItemMenu onClick={() => (setMenu(null), window.open(`/admin/transcricao?wa=${m.id}`, "_blank"))}>
                <AudioLines className="h-4 w-4 text-muted" aria-hidden /> Enviar para transcrição
              </ItemMenu>
            )}
            {podeEditar && (
              <ItemMenu onClick={() => (setMenu(null), acoes.editar(m))}>
                <Pencil className="h-4 w-4 text-muted" aria-hidden /> Editar
              </ItemMenu>
            )}
            {podeApagar && (
              <ItemMenu perigo onClick={() => (setMenu(null), acoes.apagar(m))}>
                <Trash2 className="h-4 w-4" aria-hidden /> Apagar para todos
              </ItemMenu>
            )}
          </Menu>
        )}
      </div>
    </div>
  );
});

function StatusEnvio({ status, erro }: { status: string; erro: string | null }) {
  if (status === "erro") return <X className="h-3.5 w-3.5 text-status-danger" aria-label={erro ?? "Erro no envio"} />;
  if (status === "enviando") return <Clock className="h-3 w-3" aria-label="Enviando" />;
  if (status === "lida") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Lida" />;
  if (status === "entregue") return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregue" />;
  return <Check className="h-3.5 w-3.5" aria-label="Enviada" />;
}

const ROTULO_MIDIA: Record<string, string> = {
  imagem: "📷 Foto",
  audio: "🎤 Áudio",
  video: "🎥 Vídeo",
  documento: "📄 Documento",
  figurinha: "Figurinha",
  localizacao: "📍 Localização",
  contato: "👤 Contato",
};

function Midia({ m, onAmpliar, onCarregou }: { m: Msg; onAmpliar: (m: Msg) => void; onCarregou: () => void }) {
  const url = m.media_url;
  if (m.tipo === "texto") return null;
  if (!url) {
    if (m.texto && (m.tipo === "localizacao" || m.tipo === "contato")) return null;
    const rotulo = m.tipo === "documento" ? `📄 ${m.media_nome ?? "Documento"}` : (ROTULO_MIDIA[m.tipo] ?? "Mensagem");
    return (
      <p className="mb-1 flex items-center gap-1.5 rounded-lg bg-black/5 px-2.5 py-2 text-xs italic opacity-80">
        {(m.media_pendente || m._temp) && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />}
        <span>
          {rotulo}
          {m._temp ? " · enviando…" : m.media_pendente ? " · baixando…" : m.media_erro ? " · não está mais disponível no WhatsApp" : ""}
        </span>
      </p>
    );
  }
  if (m.tipo === "imagem" || m.tipo === "figurinha")
    return (
      <button type="button" onClick={() => m.tipo === "imagem" && onAmpliar(m)} className="-mx-1 -mt-0.5 mb-1 block" aria-label="Ampliar imagem">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={m.tipo === "figurinha" ? "Figurinha" : "Imagem"}
          onLoad={onCarregou}
          className={m.tipo === "figurinha" ? "h-32 w-32 object-contain" : "max-h-80 w-full max-w-sm rounded-xl object-cover"}
          loading="lazy"
          decoding="async"
        />
      </button>
    );
  if (m.tipo === "audio") return <audio controls src={url} onLoadedMetadata={onCarregou} className="mb-1 h-10 w-72 max-w-full" preload="none" />;
  if (m.tipo === "video") return <video controls src={url} onLoadedMetadata={onCarregou} className="mb-1 max-h-80 max-w-full rounded-xl" preload="metadata" />;
  return (
    <span className="mb-1 flex items-center gap-1 rounded-xl bg-black/5">
      <button type="button" onClick={() => onAmpliar(m)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-black/5" title="Abrir documento">
        <FileText className="h-6 w-6 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px]">{m.media_nome ?? "Documento"}</span>
          <span className="block text-[11px] opacity-60">{m._temp ? "enviando… · " : ""}Clique para abrir</span>
        </span>
      </button>
      <a href={m.media_download_url ?? url} download={m.media_nome ?? true} target="_blank" rel="noreferrer" className="mr-1 rounded-lg p-2 opacity-60 hover:bg-black/10 hover:opacity-100" aria-label="Baixar documento">
        <Download className="h-4 w-4" aria-hidden />
      </a>
    </span>
  );
}

/* ───────── caixa de escrever ───────── */

function Compositor({
  ligado,
  respondendo,
  editando,
  nomeDe,
  onCancelar,
  onTexto,
  onArquivos,
}: {
  ligado: boolean;
  respondendo: Msg | null;
  editando: Msg | null;
  nomeDe: (m: Msg) => string;
  onCancelar: () => void;
  onTexto: (t: string) => void;
  onArquivos: (fs: File[], legenda: string, ptt: boolean) => void;
}) {
  const [texto, setTexto] = useState(editando?.texto ?? "");
  const [anexos, setAnexos] = useState<File[]>([]);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const [gravando, setGravando] = useState(false);
  const [seg, setSeg] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const partes = useRef<Blob[]>([]);
  const cancelar = useRef(false);

  useEffect(() => {
    const el = textoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  function mandar() {
    if (anexos.length) {
      onArquivos(anexos, texto.trim(), false);
      setAnexos([]);
      setTexto("");
      return;
    }
    const t = texto.trim();
    if (!t) return;
    onTexto(t);
    setTexto("");
  }

  async function gravar() {
    if (!navigator.mediaDevices?.getUserMedia) return void toast.error("Este navegador não grava áudio.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      return void toast.error("Sem acesso ao microfone. Libere a permissão no navegador.");
    }
    const tipo = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    partes.current = [];
    cancelar.current = false;
    rec.ondataavailable = (e) => e.data.size && partes.current.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setGravando(false);
      if (cancelar.current) return;
      const blob = new Blob(partes.current, { type: rec.mimeType || "audio/webm" });
      if (blob.size < 800) return;
      const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
      onArquivos([new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type })], "", true);
    };
    recRef.current = rec;
    rec.start(500);
    setSeg(0);
    setGravando(true);
  }
  function parar(descartar: boolean) {
    cancelar.current = descartar;
    recRef.current?.stop();
  }

  const mmss = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;

  return (
    <footer className="border-t border-border bg-surface px-2.5 py-2">
      {(respondendo || editando) && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-gold bg-surface-2 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-gold-ink">{editando ? "Editando mensagem" : `Respondendo a ${nomeDe(respondendo!)}`}</span>
            <span className="block truncate text-muted">{(editando ?? respondendo)!.texto ?? (editando ?? respondendo)!.media_nome ?? "Mídia"}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onCancelar();
              if (editando) setTexto("");
            }}
            className="icon-btn"
            aria-label="Cancelar"
          >
            <X aria-hidden />
          </button>
        </div>
      )}
      {anexos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {anexos.map((f, i) => (
            <span key={i} className="inline-flex max-w-60 items-center gap-1.5 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-2 text-xs">
              <Paperclip className="h-3 w-3 shrink-0 text-muted" aria-hidden />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-muted">{tamanhoLegivel(f.size)}</span>
              <button type="button" onClick={() => setAnexos((a) => a.filter((_, j) => j !== i))} className="rounded p-0.5 hover:bg-surface" aria-label={`Tirar ${f.name}`}>
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      {gravando ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => parar(true)} className="icon-btn icon-btn-danger" aria-label="Descartar áudio">
            <Trash2 aria-hidden />
          </button>
          <span className="flex flex-1 items-center gap-2 rounded-full bg-status-danger-bg px-4 py-2 text-sm text-status-danger">
            <span className="h-2 w-2 animate-pulse rounded-full bg-status-danger" aria-hidden /> Gravando {mmss}
          </span>
          <button type="button" onClick={() => parar(false)} className="ui-btn h-10 w-10 shrink-0 p-0" aria-label="Enviar áudio">
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <input
            ref={arquivoRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length) setAnexos((a) => [...a, ...fs].slice(0, 10));
              e.target.value = "";
            }}
          />
          <button type="button" onClick={() => arquivoRef.current?.click()} disabled={!ligado || !!editando} className="icon-btn h-10 w-10" aria-label="Anexar arquivos" data-tip="Anexar">
            <Paperclip aria-hidden />
          </button>
          <textarea
            id="wa-texto"
            ref={textoRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={(e) => {
              const fs = Array.from(e.clipboardData.files);
              if (fs.length) {
                e.preventDefault();
                setAnexos((a) => [...a, ...fs].slice(0, 10));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                mandar();
              }
              if (e.key === "Escape") onCancelar();
            }}
            rows={1}
            autoFocus={!!editando}
            disabled={!ligado}
            placeholder={!ligado ? "Agente fora do ar: não dá pra enviar agora" : anexos.length ? "Legenda (opcional)" : "Mensagem"}
            className="ui-input max-h-40 min-h-10 flex-1 resize-none !rounded-2xl py-2"
            aria-label="Mensagem"
          />
          {texto.trim() || anexos.length || editando ? (
            <button type="button" onClick={mandar} disabled={!ligado} className="ui-btn h-10 w-10 shrink-0 p-0" aria-label={editando ? "Salvar edição" : "Enviar"}>
              {editando ? <Check className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            </button>
          ) : (
            <button type="button" onClick={() => void gravar()} disabled={!ligado} className="ui-btn h-10 w-10 shrink-0 p-0" aria-label="Gravar áudio">
              <Mic className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      )}
    </footer>
  );
}

/* ───────── encaminhar ───────── */

function Encaminhar({ m, conversas, onFechar, onEnviar }: { m: Msg; conversas: WaChat[]; onFechar: () => void; onEnviar: (para: string[]) => void }) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const termo = busca.trim().toLowerCase();
  const lista = conversas.filter((c) => !termo || (c.nome ?? "").toLowerCase().includes(termo) || c.chat_jid.includes(termo.replace(/\D/g, "") || "§")).slice(0, 80);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Encaminhar mensagem" onClick={onFechar}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <p className="flex-1 font-semibold text-foreground">Encaminhar para…</p>
          <button type="button" onClick={onFechar} className="icon-btn" aria-label="Fechar">
            <X aria-hidden />
          </button>
        </div>
        <div className="p-3">
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversa" className="ui-input" aria-label="Buscar conversa" />
          <p className="mt-2 truncate text-xs text-muted">{m.texto ?? m.media_nome ?? "Mídia"}</p>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {lista.map((c) => {
            const on = sel.includes(c.chat_jid);
            return (
              <li key={c.chat_jid}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setSel((s) => (on ? s.filter((x) => x !== c.chat_jid) : s.length < 20 ? [...s, c.chat_jid] : s))}
                    className="h-4 w-4 accent-[var(--navy)]"
                  />
                  <AvatarWa nome={c.nome || telefone(c.chat_jid)} grupo={c.is_group} foto={c.foto_url} tamanho="h-8 w-8" />
                  <span className="truncate text-sm">{c.nome || telefone(c.chat_jid)}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-border p-3">
          <span className="text-xs text-muted">{sel.length} selecionada(s)</span>
          <button type="button" disabled={!sel.length} onClick={() => onEnviar(sel)} className="ui-btn">
            <Forward className="h-4 w-4" aria-hidden /> Encaminhar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── documento aberto na tela ───────── */

const extensao = (nome?: string | null) => (nome?.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
const escaparHtml = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const PAGINA_DOC = (corpo: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2328;background:#fff;max-width:820px;margin:0 auto;padding:40px 48px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}img{max-width:100%}pre{white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;font-size:13px}</style></head><body>${corpo}</body></html>`;

type Visao = { tipo: "pdf" | "imagem" | "html" | "nao_abre" | "carregando" | "erro"; html?: string; erro?: string };

/** Abre o documento dentro do portal: PDF, Word (.docx), texto/HTML e imagem; o resto oferece baixar. */
function VerDocumento({ m, onFechar }: { m: Msg; onFechar: () => void }) {
  const url = m.media_url;
  const ext = extensao(m.media_nome);
  const mime = (m.media_mime ?? "").toLowerCase();
  const [visao, setVisao] = useState<Visao>({ tipo: "carregando" });

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  useEffect(() => {
    if (!url) return;
    let vivo = true;
    const pronto = (v: Visao) => vivo && setVisao(v);
    (async () => {
      try {
        if (ext === "pdf" || mime.includes("pdf")) return pronto({ tipo: "pdf" });
        if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return pronto({ tipo: "imagem" });
        if (ext === "docx" || mime.includes("wordprocessingml")) {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`O arquivo não abriu (${r.status}).`);
          const mammoth = await import("mammoth");
          const { value } = await mammoth.convertToHtml({ arrayBuffer: await r.arrayBuffer() });
          return pronto({ tipo: "html", html: PAGINA_DOC(value || "<p><em>Documento sem texto.</em></p>") });
        }
        if (["txt", "csv", "json", "xml", "md", "log", "html", "htm"].includes(ext) || mime.startsWith("text/")) {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`O arquivo não abriu (${r.status}).`);
          const texto = await r.text();
          // HTML aparece como página (sem scripts: iframe com sandbox); o resto como texto
          return pronto({ tipo: "html", html: ext === "html" || ext === "htm" || mime.includes("html") ? texto : PAGINA_DOC(`<pre>${escaparHtml(texto)}</pre>`) });
        }
        pronto({ tipo: "nao_abre" });
      } catch (e) {
        pronto({ tipo: "erro", erro: e instanceof Error ? e.message : "Não foi possível abrir." });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [url, ext, mime]);

  const baixar = m.media_download_url ?? url;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black/85" role="dialog" aria-modal="true" aria-label={`Documento ${m.media_nome ?? ""}`} onClick={onFechar}>
      <div className="flex items-center gap-2 px-3 py-2.5 text-white" onClick={(e) => e.stopPropagation()}>
        <FileText className="h-5 w-5 shrink-0 opacity-80" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{m.media_nome ?? "Documento"}</p>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="rounded-full bg-white/10 px-3 py-2 text-xs hover:bg-white/20">
            Abrir em outra aba
          </a>
        )}
        {baixar && (
          <a href={baixar} download={m.media_nome ?? true} target="_blank" rel="noreferrer" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Baixar">
            <Download className="h-4 w-4" aria-hidden />
          </a>
        )}
        <button type="button" onClick={onFechar} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Fechar">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <Aviso texto={m.media_pendente ? "O arquivo ainda está sendo baixado do WhatsApp. Tente de novo em instantes." : "Este arquivo não está mais disponível no WhatsApp."} />
        ) : visao.tipo === "carregando" ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/80" aria-label="Abrindo" />
        ) : visao.tipo === "pdf" ? (
          <iframe src={url} title={m.media_nome ?? "PDF"} className="h-full w-full max-w-5xl rounded-lg bg-white" />
        ) : visao.tipo === "imagem" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={m.media_nome ?? "Imagem"} className="max-h-full max-w-full object-contain" />
        ) : visao.tipo === "html" ? (
          <iframe srcDoc={visao.html} sandbox="" title={m.media_nome ?? "Documento"} className="h-full w-full max-w-5xl rounded-lg bg-white" />
        ) : (
          <Aviso
            texto={
              visao.tipo === "erro"
                ? (visao.erro ?? "Não foi possível abrir.")
                : `Arquivos ${ext ? `.${ext} ` : ""}não abrem dentro do navegador. Baixe para abrir no computador.`
            }
            baixar={baixar}
          />
        )}
      </div>
    </div>,
    document.body
  );
}

function Aviso({ texto, baixar }: { texto: string; baixar?: string | null }) {
  return (
    <div className="max-w-sm rounded-2xl bg-surface p-6 text-center text-sm text-foreground">
      <FileText className="mx-auto mb-3 h-10 w-10 text-muted" aria-hidden />
      <p>{texto}</p>
      {baixar && (
        <a href={baixar} target="_blank" rel="noreferrer" className="ui-btn mt-4 inline-flex">
          <Download className="h-4 w-4" aria-hidden /> Baixar
        </a>
      )}
    </div>
  );
}

/* ───────── imagem em tela cheia ───────── */

function Ampliada({ m, onFechar }: { m: Msg; onFechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);
  if (!m.media_url) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true" aria-label="Imagem ampliada" onClick={onFechar}>
      <div className="flex justify-end gap-2 p-3">
        <a
          href={m.media_download_url ?? m.media_url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Baixar imagem"
        >
          <Download className="h-5 w-5" aria-hidden />
        </a>
        <button type="button" onClick={onFechar} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Fechar">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.media_url} alt="Imagem" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full object-contain" />
      </div>
      {m.texto && <p className="mx-auto max-w-2xl px-4 pb-6 text-center text-sm text-white/90">{m.texto}</p>}
    </div>
  );
}
