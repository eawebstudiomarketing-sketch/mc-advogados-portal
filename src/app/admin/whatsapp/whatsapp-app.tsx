"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Loader2,
  MessageCircle,
  Power,
  QrCode,
  Unplug,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { WaAgente, WaChat, WaMensagem } from "@/lib/whatsapp";
import {
  carregarConversaAction,
  desligarAgenteAction,
  enviarMensagemAction,
  limparConversasAction,
  linkMidiaAction,
  marcarLidoAction,
  sairDoNumeroAction,
  gerarQrAction,
  cancelarQrAction,
  vincularClienteAction,
} from "./actions";

// Tela WhatsApp (só admin): espelho ao vivo das conversas que o Agente MC grava
// no banco. Enviar daqui cria uma ordem em wa_jobs; quem manda é o Agente.

const HEARTBEAT_LIMITE_MS = 35_000; // igual a lib/whatsapp (não dá pra importar server-only aqui)
const ligadoAgora = (a: WaAgente | null) =>
  !!a?.online && !!a.last_heartbeat && Date.now() - new Date(a.last_heartbeat).getTime() < HEARTBEAT_LIMITE_MS;

type Cliente = { id: string; name: string };

const telefone = (jid: string) => {
  if (jid.endsWith("@g.us")) return "Grupo";
  if (jid.endsWith("@lid")) return "Número oculto pelo WhatsApp";
  const d = jid.split("@")[0];
  if (d.length === 13 && d.startsWith("55")) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d;
};

function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return hora;
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

const iniciais = (nome: string) =>
  nome
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

export function WhatsappApp({
  agenteInicial,
  conversasIniciais,
  clientes,
}: {
  agenteInicial: WaAgente | null;
  conversasIniciais: WaChat[];
  clientes: Cliente[];
}) {
  const [supabase] = useState(() => createClient());
  const [agente, setAgente] = useState<WaAgente | null>(agenteInicial);
  const [, setTick] = useState(0); // re-renderiza pra o 🟢 virar 🔴 quando o batimento para
  const [conversas, setConversas] = useState<WaChat[]>(conversasIniciais);
  const [aberta, setAberta] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<WaMensagem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [busca, setBusca] = useState("");
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const abertaRef = useRef<string | null>(null);
  useEffect(() => {
    abertaRef.current = aberta;
  }, [aberta]);

  const ligado = ligadoAgora(agente);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  // tempo real: agente, conversas e mensagens
  useEffect(() => {
    const canal = supabase
      .channel("whatsapp-portal")
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_agent" }, (p) => {
        const novo = p.new as WaAgente;
        if (!novo?.device_id) return;
        setAgente((atual) =>
          !atual || atual.device_id === novo.device_id || (novo.last_heartbeat ?? "") > (atual.last_heartbeat ?? "")
            ? { ...novo, ligado: ligadoAgora(novo) }
            : atual
        );
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_chats" }, (p) => {
        if (p.eventType === "DELETE") {
          const jid = (p.old as Partial<WaChat>).chat_jid;
          setConversas((cs) => cs.filter((c) => c.chat_jid !== jid));
          return;
        }
        const c = p.new as WaChat;
        setConversas((cs) => {
          const resto = cs.filter((x) => x.chat_jid !== c.chat_jid);
          return c.arquivado ? resto : [c, ...resto].sort((a, b) => (b.ultima_msg_em ?? "").localeCompare(a.ultima_msg_em ?? ""));
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_messages" }, async (p) => {
        if (p.eventType === "DELETE") return;
        const m = p.new as WaMensagem;
        if (m.chat_jid !== abertaRef.current) return;
        const comLink = m.media_path ? { ...m, media_url: await linkMidiaAction(m) } : m;
        setMensagens((ms) => {
          const i = ms.findIndex((x) => x.id === m.id);
          if (i >= 0) {
            const copia = [...ms];
            copia[i] = { ...comLink, media_url: comLink.media_url ?? ms[i].media_url };
            return copia;
          }
          return [...ms, comLink].sort((a, b) => a.wa_timestamp.localeCompare(b.wa_timestamp));
        });
        if (!m.from_me && p.eventType === "INSERT") void marcarLidoAction(m.chat_jid);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [supabase]);

  const abrir = useCallback(async (jid: string) => {
    abertaRef.current = jid;
    setAberta(jid);
    setMensagens([]);
    setCarregando(true);
    try {
      const ms = await carregarConversaAction(jid);
      if (abertaRef.current !== jid) return;
      setMensagens(ms);
      setTemMais(ms.length >= 60);
    } finally {
      setCarregando(false);
    }
    setConversas((cs) => cs.map((c) => (c.chat_jid === jid ? { ...c, nao_lidas: 0 } : c)));
    void marcarLidoAction(jid);
  }, []);

  async function carregarAntigas() {
    if (!aberta || !mensagens.length) return;
    const antigas = await carregarConversaAction(aberta, mensagens[0].wa_timestamp);
    setTemMais(antigas.length >= 60);
    setMensagens((ms) => [...antigas, ...ms]);
  }

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const dig = t.replace(/\D/g, "");
    return conversas.filter(
      (c) =>
        (!soNaoLidas || c.nao_lidas > 0) &&
        (!t || (c.nome ?? "").toLowerCase().includes(t) || (dig.length >= 4 && c.chat_jid.includes(dig)))
    );
  }, [conversas, busca, soNaoLidas]);

  const chat = conversas.find((c) => c.chat_jid === aberta) ?? null;
  const totalNaoLidas = conversas.reduce((s, c) => s + (c.nao_lidas > 0 ? 1 : 0), 0);

  return (
    <div className="space-y-4">
      <PainelAgente agente={agente} ligado={ligado} />

      <div className="ui-card flex h-[calc(100dvh-16rem)] min-h-[480px] overflow-hidden p-0">
        {/* lista de conversas */}
        <aside className={`${aberta ? "hidden md:flex" : "flex"} w-full flex-col border-r border-border md:w-80 lg:w-96`}>
          <div className="space-y-2 border-b border-border p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nome ou número"
                className="ui-input pl-9"
                aria-label="Buscar conversa"
              />
            </label>
            <div className="flex gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setSoNaoLidas(false)}
                className={`rounded-full px-3 py-1 ${!soNaoLidas ? "bg-navy text-navy-foreground" : "bg-surface-2 text-muted hover:text-foreground"}`}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setSoNaoLidas(true)}
                className={`rounded-full px-3 py-1 ${soNaoLidas ? "bg-navy text-navy-foreground" : "bg-surface-2 text-muted hover:text-foreground"}`}
              >
                Não lidas{totalNaoLidas ? ` (${totalNaoLidas})` : ""}
              </button>
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto">
            {filtradas.length === 0 && (
              <li className="p-6 text-center text-sm text-muted">
                {conversas.length === 0
                  ? "Nenhuma conversa ainda. Com o Agente ligado, as mensagens novas aparecem aqui."
                  : "Nada encontrado."}
              </li>
            )}
            {filtradas.map((c) => {
              const nome = c.nome || telefone(c.chat_jid);
              const cliente = c.client_id ? clientes.find((x) => x.id === c.client_id) : null;
              return (
                <li key={c.chat_jid}>
                  <button
                    type="button"
                    onClick={() => void abrir(c.chat_jid)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2 ${aberta === c.chat_jid ? "bg-surface-2" : ""}`}
                  >
                    <Avatar nome={nome} grupo={c.is_group} foto={c.foto_url} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`truncate text-sm ${c.nao_lidas ? "font-semibold text-foreground" : "text-foreground"}`}>{nome}</span>
                        <span className={`ml-auto shrink-0 text-[11px] ${c.nao_lidas ? "font-semibold text-status-success" : "text-muted"}`}>
                          {quando(c.ultima_msg_em)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="truncate text-xs text-muted">
                          {cliente && <span className="mr-1 rounded bg-gold-soft px-1 py-px text-[10px] font-medium text-gold-ink">{cliente.name}</span>}
                          {c.ultima_msg_preview ?? ""}
                        </span>
                        {c.nao_lidas > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-status-success px-1.5 text-[11px] font-semibold text-white">
                            {c.nao_lidas}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* conversa aberta */}
        <section className={`${aberta ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-surface-2/40`}>
          {!chat ? (
            <div className="m-auto max-w-xs p-6 text-center text-sm text-muted">
              <MessageCircle className="mx-auto mb-2 h-8 w-8 text-muted/60" aria-hidden />
              Escolha uma conversa. Para mandar a IA fazer algo (enviar relatório, resumir, triagem), use o assistente com <kbd className="rounded border border-border px-1">Ctrl</kbd>+<kbd className="rounded border border-border px-1">J</kbd>.
            </div>
          ) : (
            <Conversa
              key={chat.chat_jid}
              chat={chat}
              clientes={clientes}
              mensagens={mensagens}
              carregando={carregando}
              temMais={temMais}
              ligado={ligado}
              onVoltar={() => setAberta(null)}
              onAntigas={carregarAntigas}
              onVinculo={(clientId) => setConversas((cs) => cs.map((c) => (c.chat_jid === chat.chat_jid ? { ...c, client_id: clientId } : c)))}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function Avatar({ nome, grupo, foto }: { nome: string; grupo: boolean; foto?: string | null }) {
  if (foto) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-2 text-xs font-semibold text-navy-foreground">
      {grupo ? <Users className="h-4 w-4" aria-hidden /> : /\p{L}/u.test(nome) ? iniciais(nome) : <UserRound className="h-4 w-4" aria-hidden />}
    </span>
  );
}

/* ───────── status do Agente: ligado/desligado, QR, trocar número ───────── */

function PainelAgente({ agente, ligado }: { agente: WaAgente | null; ligado: boolean }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<"desconectar" | "trocar" | null>(null);
  const [limpar, setLimpar] = useState(false);

  // ligado + estado "desligado" = Agente rodando, mas sem número conectado
  const estado = !ligado ? "agente_off" : agente?.estado === "desligado" ? "sem_numero" : (agente?.estado ?? "conectando");
  const numero = agente?.numero ? telefone(`${agente.numero}@s.whatsapp.net`) : null;

  async function rodar(nome: string, fn: () => Promise<{ ok: boolean; erro?: string } | void>) {
    setOcupado(nome);
    setErro(null);
    try {
      const r = await fn();
      if (r && !r.ok) setErro(r.erro ?? "Não deu certo.");
      else setConfirmar(null);
    } finally {
      setOcupado(null);
    }
  }

  const ROTULO: Record<string, { texto: string; cor: string }> = {
    agente_off: { texto: "Agente desligado", cor: "bg-status-danger" },
    sem_numero: { texto: "Nenhum número conectado", cor: "bg-muted" },
    conectando: { texto: "Conectando…", cor: "bg-status-pending" },
    aguardando_qr: { texto: "Escaneie o QR com o celular", cor: "bg-status-pending" },
    conectado: { texto: "Conectado", cor: "bg-status-success" },
  };
  const r = ROTULO[estado] ?? ROTULO.conectando;
  const subtitulo =
    estado === "agente_off"
      ? "Para ligar: clique duas vezes em “Ligar Agente MC” na área de trabalho do computador."
      : estado === "sem_numero"
        ? "O Agente está ligado. Clique em “Conectar número” para gerar o QR."
        : [numero && `Número ${numero}`, agente?.label].filter(Boolean).join(" · ") || "—";
  const icone = (nome: string, Icone: typeof Power) =>
    ocupado === nome ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Icone className="h-3.5 w-3.5" aria-hidden />;

  return (
    <div className="ui-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="relative flex h-3 w-3">
          {estado === "conectado" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-success opacity-50" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${r.cor}`} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-foreground">{r.texto}</p>
          <p className="text-xs text-muted">{subtitulo}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {estado === "sem_numero" && (
            <button type="button" disabled={!!ocupado} onClick={() => void rodar("qr", gerarQrAction)} className="ui-btn px-3 py-1.5 text-xs">
              {icone("qr", QrCode)} Conectar número
            </button>
          )}
          {estado === "conectado" && (
            <>
              <button type="button" onClick={() => setConfirmar(confirmar === "trocar" ? null : "trocar")} className="ui-btn-secondary px-3 py-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Trocar número
              </button>
              <button type="button" onClick={() => setConfirmar(confirmar === "desconectar" ? null : "desconectar")} className="ui-btn-secondary px-3 py-1.5 text-xs">
                <Unplug className="h-3.5 w-3.5" aria-hidden /> Desconectar
              </button>
            </>
          )}
          {estado === "aguardando_qr" && (
            <button type="button" disabled={!!ocupado} onClick={() => void rodar("cancelar", cancelarQrAction)} className="ui-btn-secondary px-3 py-1.5 text-xs">
              {icone("cancelar", X)} Cancelar
            </button>
          )}
          {ligado && (
            <button type="button" disabled={!!ocupado} onClick={() => void rodar("desligar", desligarAgenteAction)} className="ui-btn-secondary px-3 py-1.5 text-xs">
              {icone("desligar", Power)} Desligar Agente
            </button>
          )}
          {(estado === "agente_off" || estado === "sem_numero") && (
            <button
              type="button"
              disabled={!!ocupado}
              onClick={() => {
                if (confirm("Apagar do portal todas as conversas e mídias espelhadas? O celular não é afetado.")) void rodar("limpar", limparConversasAction);
              }}
              className="ui-btn-secondary px-3 py-1.5 text-xs"
            >
              {icone("limpar", Trash2)} Limpar conversas
            </button>
          )}
        </div>
      </div>

      {estado === "aguardando_qr" && agente?.qr && (
        <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={agente.qr} alt="QR para conectar o WhatsApp" className="h-56 w-56 rounded-lg bg-white p-2" />
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
            <li>No celular com o número que vai ser usado, abra o WhatsApp.</li>
            <li>
              Toque em <b>⋮</b> (ou Configurações no iPhone) → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>.
            </li>
            <li>Aponte a câmera para este QR. O código troca sozinho aqui; se trocar enquanto você aponta, é só apontar de novo.</li>
            <li className="text-muted">Se ninguém escanear em uns 2 minutos, o QR para. É só clicar em “Conectar número” de novo.</li>
          </ol>
        </div>
      )}

      {agente?.ultimo_erro && ligado && estado !== "conectado" && <p className="mt-2 text-xs text-status-pending">{agente.ultimo_erro}</p>}

      {confirmar && (
        <div className="mt-4 rounded-xl border border-status-pending/30 bg-status-pending-bg p-4 text-sm">
          <p className="font-semibold text-foreground">
            {confirmar === "trocar" ? `Trocar ${numero ?? "o número"} por outro?` : `Desconectar ${numero ?? "o número"}?`}
          </p>
          <p className="mt-1 text-muted">
            {confirmar === "trocar"
              ? "O Agente sai deste número (some de “Aparelhos conectados” no celular) e já mostra aqui o QR para conectar o outro."
              : "O Agente sai deste número (some de “Aparelhos conectados” no celular) e fica parado, sem gerar QR, até você clicar em “Conectar número”."}
          </p>
          <label className="mt-3 flex items-center gap-2 text-foreground">
            <input type="checkbox" checked={limpar} onChange={(e) => setLimpar(e.target.checked)} className="h-4 w-4 accent-[var(--color-navy)]" />
            Apagar do portal as conversas deste número
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmar(null)} className="ui-btn-secondary px-3 py-1.5 text-xs">
              Cancelar
            </button>
            <button
              type="button"
              disabled={!!ocupado}
              onClick={() => void rodar("sair", () => sairDoNumeroAction(confirmar === "trocar", limpar))}
              className="ui-btn px-3 py-1.5 text-xs"
            >
              {icone("sair", confirmar === "trocar" ? Smartphone : Unplug)} {confirmar === "trocar" ? "Desconectar e gerar QR" : "Desconectar"}
            </button>
          </div>
        </div>
      )}

      {erro && <p className="mt-2 text-xs text-status-danger">{erro}</p>}
    </div>
  );
}

/* ───────── conversa aberta ───────── */

function Conversa({
  chat,
  clientes,
  mensagens,
  carregando,
  temMais,
  ligado,
  onVoltar,
  onAntigas,
  onVinculo,
}: {
  chat: WaChat;
  clientes: Cliente[];
  mensagens: WaMensagem[];
  carregando: boolean;
  temMais: boolean;
  ligado: boolean;
  onVoltar: () => void;
  onAntigas: () => Promise<void>;
  onVinculo: (clientId: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const ultimoId = mensagens[mensagens.length - 1]?.id;
  const nome = chat.nome || telefone(chat.chat_jid);

  // desce pro fim quando chega mensagem nova (não quando carrega as antigas)
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [ultimoId]);

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await enviarMensagemAction(chat.chat_jid, t);
    setEnviando(false);
    if (!r.ok) setErro(r.erro ?? "Não foi possível enviar.");
    else setTexto("");
  }

  async function vincular(clientId: string) {
    const id = clientId || null;
    onVinculo(id);
    await vincularClienteAction(chat.chat_jid, id);
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2.5">
        <button type="button" onClick={onVoltar} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 md:hidden" aria-label="Voltar para as conversas">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <Avatar nome={nome} grupo={chat.is_group} foto={chat.foto_url} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-foreground">{nome}</p>
          <p className="truncate text-xs text-muted">{telefone(chat.chat_jid)}</p>
        </div>
        {!chat.is_group && (
          <div className="flex items-center gap-1.5">
            <select
              value={chat.client_id ?? ""}
              onChange={(e) => void vincular(e.target.value)}
              className="ui-input max-w-44 py-1.5 text-xs"
              aria-label="Cliente vinculado a esta conversa"
              title="Cliente vinculado — a IA usa isso pra achar o WhatsApp do cliente"
            >
              <option value="">Sem cliente vinculado</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {chat.client_id && (
              <Link href={`/admin/clients/${chat.client_id}`} className="ui-link hidden text-xs sm:inline">
                ficha
              </Link>
            )}
          </div>
        )}
      </header>

      <div ref={rolagemRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-6">
        {temMais && !carregando && (
          <div className="pb-2 text-center">
            <button type="button" onClick={() => void onAntigas()} className="ui-btn-secondary px-3 py-1 text-xs">
              Carregar mensagens anteriores
            </button>
          </div>
        )}
        {carregando && (
          <div className="flex justify-center py-8 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" />
          </div>
        )}
        {!carregando && mensagens.length === 0 && <p className="py-8 text-center text-sm text-muted">Sem mensagens espelhadas nesta conversa.</p>}
        {mensagens.map((m, i) => {
          const dia = diaDe(m.wa_timestamp);
          const separador = i === 0 || dia !== diaDe(mensagens[i - 1].wa_timestamp);
          return (
            <div key={m.id}>
              {separador && (
                <div className="my-3 text-center">
                  <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-muted shadow-sm">{dia}</span>
                </div>
              )}
              <Balao m={m} grupo={chat.is_group} />
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      <footer className="border-t border-border bg-surface p-2.5">
        {erro && (
          <p className="mb-2 flex items-center gap-1.5 px-1 text-xs text-status-danger">
            <X className="h-3.5 w-3.5" aria-hidden /> {erro}
          </p>
        )}
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
            disabled={!ligado}
            placeholder={ligado ? "Escreva uma mensagem (Enter envia, Shift+Enter quebra linha)" : "Ligue o Agente MC para enviar"}
            className="ui-input max-h-40 min-h-10 flex-1 resize-none py-2"
            aria-label="Mensagem"
          />
          <button type="button" onClick={() => void enviar()} disabled={!ligado || !texto.trim() || enviando} className="ui-btn h-10 w-10 shrink-0 p-0" aria-label="Enviar">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </footer>
    </>
  );
}

function Balao({ m, grupo }: { m: WaMensagem; grupo: boolean }) {
  const meu = m.from_me;
  const hora = new Date(m.wa_timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const remetente = grupo && !meu && m.sender_jid ? telefone(m.sender_jid) : null;

  return (
    <div className={`flex ${meu ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm shadow-sm sm:max-w-[70%] ${
          meu ? "rounded-br-md bg-[#d9fdd3] text-[#111b21]" : "rounded-bl-md bg-surface text-foreground"
        }`}
      >
        {remetente && <p className="text-[11px] font-semibold text-gold-ink">{remetente}</p>}
        <Midia m={m} />
        {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
        <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${meu ? "opacity-70" : "text-muted"}`}>
          {meu && m.quem === "ia" && (
            <span className="inline-flex items-center gap-0.5 rounded bg-black/10 px-1" title="Enviada pela IA do portal">
              <Bot className="h-3 w-3" aria-hidden /> IA
            </span>
          )}
          {hora}
          {meu && <StatusEnvio status={m.status} erro={m.erro} />}
        </p>
      </div>
    </div>
  );
}

function StatusEnvio({ status, erro }: { status: string; erro: string | null }) {
  if (status === "erro") return <X className="h-3.5 w-3.5 text-status-danger" aria-label={erro ?? "Erro no envio"} />;
  if (status === "enviando") return <Clock className="h-3 w-3" aria-label="Enviando" />;
  if (status === "lida") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Lida" />;
  if (status === "entregue") return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregue" />;
  return <Check className="h-3.5 w-3.5" aria-label="Enviada" />;
}

function Midia({ m }: { m: WaMensagem }) {
  const url = m.media_url;
  if (m.tipo === "texto") return null;
  if (!url) {
    const rotulo: Record<string, string> = {
      imagem: "📷 Imagem",
      audio: "🎤 Áudio",
      video: "🎬 Vídeo",
      documento: `📄 ${m.media_nome ?? "Documento"}`,
      figurinha: "Figurinha",
      localizacao: "📍 Localização",
      contato: "👤 Contato",
    };
    return m.texto && (m.tipo === "localizacao" || m.tipo === "contato") ? null : <p className="italic opacity-70">{rotulo[m.tipo] ?? "Mensagem"}</p>;
  }
  if (m.tipo === "imagem" || m.tipo === "figurinha")
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={m.tipo === "figurinha" ? "Figurinha" : "Imagem"} className={m.tipo === "figurinha" ? "h-32 w-32 object-contain" : "max-h-72 rounded-lg"} loading="lazy" />
      </a>
    );
  if (m.tipo === "audio") return <audio controls src={url} className="mb-1 h-10 w-64 max-w-full" preload="none" />;
  if (m.tipo === "video") return <video controls src={url} className="mb-1 max-h-72 rounded-lg" preload="metadata" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 hover:bg-black/10">
      <FileText className="h-5 w-5 shrink-0" aria-hidden />
      <span className="truncate">{m.media_nome ?? "Documento"}</span>
    </a>
  );
}
