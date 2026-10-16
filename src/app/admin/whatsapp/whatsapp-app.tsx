"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  Ban,
  Bot,
  Check,
  CheckCheck,
  Clock,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  Pencil,
  Power,
  QrCode,
  Unplug,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { WaAgente, WaChat, WaContato, WaMensagem } from "@/lib/whatsapp";
import {
  abrirContatoAction,
  carregarConversaAction,
  desligarAgenteAction,
  enviarMensagemAction,
  linkFotoAction,
  prepararMensagemAction,
  marcarLidoAction,
  sairDoNumeroAction,
  gerarQrAction,
  cancelarQrAction,
  vincularClienteAction,
} from "./actions";

// Tela WhatsApp (só admin): o WhatsApp do escritório dentro do portal, ao vivo.
// As mensagens são backup permanente: apagar no celular não apaga aqui (fica
// marcada). Enviar daqui cria uma ordem em wa_jobs; quem manda é o Agente MC.

const HEARTBEAT_LIMITE_MS = 35_000; // igual a lib/whatsapp (não dá pra importar server-only aqui)
const ligadoAgora = (a: WaAgente | null) =>
  !!a?.online && !!a.last_heartbeat && Date.now() - new Date(a.last_heartbeat).getTime() < HEARTBEAT_LIMITE_MS;
const POR_PAGINA = 60; // mensagens por carga (igual a carregarConversaAction)

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
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: d.getFullYear() === hoje.getFullYear() ? undefined : "2-digit" });
}

const diaDe = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric" });
};

const iniciais = (nome: string) =>
  nome
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

const ordenar = (cs: WaChat[]) => [...cs].sort((a, b) => (b.ultima_msg_em ?? "").localeCompare(a.ultima_msg_em ?? ""));

export function WhatsappApp({
  agenteInicial,
  conversasIniciais,
  contatos,
  clientes,
}: {
  agenteInicial: WaAgente | null;
  conversasIniciais: WaChat[];
  contatos: WaContato[];
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
  const [filtro, setFiltro] = useState<"todas" | "naoLidas" | "grupos" | "contatos">("todas");
  const [visiveis, setVisiveis] = useState(150);
  const abertaRef = useRef<string | null>(null);
  const conversasRef = useRef(conversas);
  useEffect(() => {
    abertaRef.current = aberta;
  }, [aberta]);
  useEffect(() => {
    conversasRef.current = conversas;
  }, [conversas]);

  const ligado = ligadoAgora(agente);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  // nome de cada número (agenda + conversas), pra mostrar quem falou nos grupos
  const nomes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contatos) {
      const n = c.nome || c.nome_perfil;
      if (n) m.set(c.jid, n);
    }
    for (const c of conversas) if (c.nome && !c.is_group) m.set(c.chat_jid, c.nome);
    return m;
  }, [contatos, conversas]);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_chats" }, async (p) => {
        if (p.eventType === "DELETE") {
          const jid = (p.old as Partial<WaChat>).chat_jid;
          setConversas((cs) => cs.filter((c) => c.chat_jid !== jid));
          return;
        }
        const c = p.new as WaChat;
        // foto: o banco guarda o caminho; a tela precisa do link assinado
        const antes = conversasRef.current.find((x) => x.chat_jid === c.chat_jid);
        let foto = c.foto_url;
        if (c.foto_url?.startsWith("vps:")) {
          foto = antes?.foto_caminho === c.foto_url ? antes.foto_url : await linkFotoAction(c.foto_url);
        }
        const pronto: WaChat = { ...c, foto_url: foto, foto_caminho: c.foto_url };
        setConversas((cs) => {
          const resto = cs.filter((x) => x.chat_jid !== c.chat_jid);
          return c.arquivado ? resto : ordenar([pronto, ...resto]);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_messages" }, async (p) => {
        if (p.eventType === "DELETE") return;
        const bruta = p.new as WaMensagem;
        if (bruta.chat_jid !== abertaRef.current) return;
        const m = await prepararMensagemAction(bruta);
        if (m.chat_jid !== abertaRef.current) return;
        setMensagens((ms) => {
          const i = ms.findIndex((x) => x.id === m.id);
          if (i >= 0) {
            const copia = [...ms];
            copia[i] = m;
            return copia;
          }
          return [...ms, m].sort((a, b) => a.wa_timestamp.localeCompare(b.wa_timestamp));
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
    setTemMais(false);
    setCarregando(true);
    try {
      const ms = await carregarConversaAction(jid);
      if (abertaRef.current !== jid) return;
      setMensagens(ms);
      setTemMais(ms.length >= POR_PAGINA);
    } finally {
      setCarregando(false);
    }
    setConversas((cs) => cs.map((c) => (c.chat_jid === jid ? { ...c, nao_lidas: 0 } : c)));
    void marcarLidoAction(jid);
  }, []);

  async function abrirContato(c: WaContato) {
    const existe = conversas.find((x) => x.chat_jid === c.jid);
    if (!existe) {
      const novo = await abrirContatoAction(c.jid, c.nome || c.nome_perfil);
      if (!novo) return;
      setConversas((cs) => (cs.some((x) => x.chat_jid === novo.chat_jid) ? cs : ordenar([...cs, novo])));
    }
    setFiltro("todas");
    setBusca("");
    void abrir(c.jid);
  }

  const carregandoAntigas = useRef(false);
  async function carregarAntigas(): Promise<number> {
    if (!aberta || !mensagens.length || carregandoAntigas.current) return 0;
    carregandoAntigas.current = true;
    try {
      const jid = aberta;
      const antigas = await carregarConversaAction(jid, mensagens[0].wa_timestamp);
      if (abertaRef.current !== jid) return 0;
      setTemMais(antigas.length >= POR_PAGINA);
      setMensagens((ms) => [...antigas.filter((a) => !ms.some((m) => m.id === a.id)), ...ms]);
      return antigas.length;
    } finally {
      carregandoAntigas.current = false;
    }
  }

  const termo = busca.trim().toLowerCase();
  const filtradas = useMemo(() => {
    const dig = termo.replace(/\D/g, "");
    return conversas.filter(
      (c) =>
        (filtro !== "naoLidas" || c.nao_lidas > 0) &&
        (filtro !== "grupos" || c.is_group) &&
        (!termo || (c.nome ?? "").toLowerCase().includes(termo) || (dig.length >= 4 && c.chat_jid.includes(dig)))
    );
  }, [conversas, termo, filtro]);

  const contatosFiltrados = useMemo(() => {
    const dig = termo.replace(/\D/g, "");
    return contatos.filter(
      (c) =>
        !termo ||
        (c.nome ?? "").toLowerCase().includes(termo) ||
        (c.nome_perfil ?? "").toLowerCase().includes(termo) ||
        (dig.length >= 4 && c.jid.includes(dig))
    );
  }, [contatos, termo]);

  const chat = conversas.find((c) => c.chat_jid === aberta) ?? null;
  const totalNaoLidas = conversas.reduce((s, c) => s + (c.nao_lidas > 0 ? 1 : 0), 0);
  const lista = filtro === "contatos" ? contatosFiltrados : filtradas;

  const FILTROS: { id: typeof filtro; rotulo: string }[] = [
    { id: "todas", rotulo: "Todas" },
    { id: "naoLidas", rotulo: `Não lidas${totalNaoLidas ? ` (${totalNaoLidas})` : ""}` },
    { id: "grupos", rotulo: "Grupos" },
    { id: "contatos", rotulo: "Contatos" },
  ];

  return (
    <div className="space-y-4">
      <PainelAgente agente={agente} ligado={ligado} />

      <div className="ui-card flex h-[calc(100dvh-16rem)] min-h-[480px] overflow-hidden p-0">
        {/* lista de conversas / contatos */}
        <aside className={`${aberta ? "hidden md:flex" : "flex"} w-full flex-col border-r border-border md:w-80 lg:w-96`}>
          <div className="space-y-2 border-b border-border p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setVisiveis(150);
                }}
                placeholder={filtro === "contatos" ? "Buscar contato da agenda" : "Buscar nome ou número"}
                className="ui-input pl-9"
                aria-label="Buscar"
              />
            </label>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFiltro(f.id);
                    setVisiveis(150);
                  }}
                  className={`rounded-full px-3 py-1 ${filtro === f.id ? "bg-navy text-navy-foreground" : "bg-surface-2 text-muted hover:text-foreground"}`}
                >
                  {f.rotulo}
                </button>
              ))}
            </div>
          </div>
          <ul
            className="flex-1 overflow-y-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight > el.scrollHeight - 400 && visiveis < lista.length) setVisiveis((v) => v + 150);
            }}
          >
            {lista.length === 0 && (
              <li className="p-6 text-center text-sm text-muted">
                {filtro === "contatos"
                  ? contatos.length === 0
                    ? "A agenda aparece aqui depois que um número for conectado."
                    : "Nenhum contato encontrado."
                  : conversas.length === 0
                    ? "Nenhuma conversa ainda. Conecte o número para trazer as conversas do celular."
                    : "Nada encontrado."}
              </li>
            )}
            {filtro === "contatos"
              ? contatosFiltrados.slice(0, visiveis).map((c) => {
                  const nome = c.nome || c.nome_perfil || telefone(c.jid);
                  const conversa = conversas.find((x) => x.chat_jid === c.jid);
                  return (
                    <li key={c.jid}>
                      <button
                        type="button"
                        onClick={() => void abrirContato(c)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <Avatar nome={nome} grupo={false} foto={conversa?.foto_url} />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-sm text-foreground">{nome}</span>
                          <span className="block truncate text-xs text-muted">
                            {telefone(c.jid)}
                            {c.nome && c.nome_perfil && c.nome_perfil !== c.nome ? ` · ~${c.nome_perfil}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              : filtradas.slice(0, visiveis).map((c) => {
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
              nomes={nomes}
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

function Avatar({ nome, grupo, foto, tamanho = "h-10 w-10" }: { nome: string; grupo: boolean; foto?: string | null; tamanho?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto} alt="" onError={() => setFalhou(true)} className={`${tamanho} shrink-0 rounded-full bg-surface-2 object-cover`} loading="lazy" />;
  }
  return (
    <span className={`flex ${tamanho} shrink-0 items-center justify-center rounded-full bg-navy-2 text-xs font-semibold text-navy-foreground`}>
      {grupo ? <Users className="h-4 w-4" aria-hidden /> : /\p{L}/u.test(nome) ? iniciais(nome) : <UserRound className="h-4 w-4" aria-hidden />}
    </span>
  );
}

/* ───────── status do Agente: ligado/desligado, QR, trocar número ───────── */

function PainelAgente({ agente, ligado }: { agente: WaAgente | null; ligado: boolean }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<"desconectar" | "trocar" | null>(null);

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
    agente_off: { texto: "Agente fora do ar", cor: "bg-status-danger" },
    sem_numero: { texto: "Nenhum número conectado", cor: "bg-muted" },
    conectando: { texto: "Conectando…", cor: "bg-status-pending" },
    aguardando_qr: { texto: "Escaneie o QR com o celular", cor: "bg-status-pending" },
    conectado: { texto: "Conectado", cor: "bg-status-success" },
  };
  const r = ROTULO[estado] ?? ROTULO.conectando;
  const subtitulo =
    estado === "agente_off"
      ? "O Agente roda no servidor e religa sozinho. Se continuar assim por alguns minutos, avise o suporte."
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
            <button
              type="button"
              disabled={!!ocupado}
              onClick={() => void rodar("desligar", desligarAgenteAction)}
              className="ui-btn-secondary px-3 py-1.5 text-xs"
              title="No servidor, o Agente religa sozinho em alguns segundos"
            >
              {icone("desligar", Power)} Reiniciar Agente
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
            <li>Depois de conectar, deixe o celular com internet: o histórico de conversas vem dele e pode levar alguns minutos.</li>
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
              : "O Agente sai deste número (some de “Aparelhos conectados” no celular) e fica parado, sem gerar QR, até você clicar em “Conectar número”."}{" "}
            As conversas já guardadas continuam no portal.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmar(null)} className="ui-btn-secondary px-3 py-1.5 text-xs">
              Cancelar
            </button>
            <button
              type="button"
              disabled={!!ocupado}
              onClick={() => void rodar("sair", () => sairDoNumeroAction(confirmar === "trocar"))}
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
  nomes,
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
  nomes: Map<string, string>;
  mensagens: WaMensagem[];
  carregando: boolean;
  temMais: boolean;
  ligado: boolean;
  onVoltar: () => void;
  onAntigas: () => Promise<number>;
  onVinculo: (clientId: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<WaMensagem | null>(null);
  const [novasAbaixo, setNovasAbaixo] = useState(false);
  const [buscandoAntigas, setBuscandoAntigas] = useState(false);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const nome = chat.nome || telefone(chat.chat_jid);

  // Rolagem só DENTRO da caixa de mensagens (scrollIntoView rolava a página
  // inteira — era o bug de "a página sobe ao clicar na conversa").
  const primeiroId = mensagens[0]?.id;
  const ultimoId = mensagens[mensagens.length - 1]?.id;
  const antes = useRef<{ primeiro?: string; ultimo?: string; altura: number; topo: number; perto: boolean }>({ altura: 0, topo: 0, perto: true });

  useLayoutEffect(() => {
    const el = rolagemRef.current;
    if (!el) return;
    const a = antes.current;
    if (!a.ultimo) {
      el.scrollTop = el.scrollHeight; // abriu a conversa: vai pro fim
    } else if (primeiroId !== a.primeiro && ultimoId === a.ultimo) {
      el.scrollTop = el.scrollHeight - a.altura + a.topo; // carregou antigas em cima: fica onde estava
    } else if (ultimoId !== a.ultimo) {
      if (a.perto) el.scrollTop = el.scrollHeight;
      else setNovasAbaixo(true);
    }
    antes.current = { primeiro: primeiroId, ultimo: ultimoId, altura: el.scrollHeight, topo: el.scrollTop, perto: a.perto };
  }, [primeiroId, ultimoId]);

  // imagem que termina de carregar aumenta a altura: segue no fim se estava no fim
  const aoCarregarMidia = useCallback(() => {
    const el = rolagemRef.current;
    if (el && antes.current.perto) el.scrollTop = el.scrollHeight;
  }, []);

  async function aoRolar() {
    const el = rolagemRef.current;
    if (!el) return;
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    antes.current = { ...antes.current, altura: el.scrollHeight, topo: el.scrollTop, perto };
    if (perto) setNovasAbaixo(false);
    if (el.scrollTop < 120 && temMais && !buscandoAntigas && !carregando) {
      setBuscandoAntigas(true);
      antes.current = { ...antes.current, altura: el.scrollHeight, topo: el.scrollTop };
      try {
        await onAntigas();
      } finally {
        setBuscandoAntigas(false);
      }
    }
  }

  function irProFim() {
    const el = rolagemRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setNovasAbaixo(false);
  }

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErro(null);
    const r = await enviarMensagemAction(chat.chat_jid, t);
    setEnviando(false);
    if (!r.ok) setErro(r.erro ?? "Não foi possível enviar.");
    else {
      setTexto("");
      antes.current.perto = true;
    }
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

      <div className="relative min-h-0 flex-1">
        <div ref={rolagemRef} onScroll={() => void aoRolar()} className="h-full space-y-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6">
          {(buscandoAntigas || (temMais && !carregando)) && (
            <div className="flex justify-center pb-2 text-muted">
              {buscandoAntigas ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando mensagens anteriores" />
              ) : (
                <button type="button" onClick={() => void onAntigas()} className="ui-btn-secondary px-3 py-1 text-xs">
                  Carregar mensagens anteriores
                </button>
              )}
            </div>
          )}
          {carregando && (
            <div className="flex justify-center py-8 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" />
            </div>
          )}
          {!carregando && mensagens.length === 0 && <p className="py-8 text-center text-sm text-muted">Nenhuma mensagem guardada nesta conversa ainda.</p>}
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
                <Balao m={m} grupo={chat.is_group} nomes={nomes} onAmpliar={setAmpliada} onCarregou={aoCarregarMidia} />
              </div>
            );
          })}
        </div>
        {novasAbaixo && (
          <button
            type="button"
            onClick={irProFim}
            className="absolute bottom-3 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-foreground shadow-md ring-1 ring-border hover:bg-surface-2"
            aria-label="Ir para as mensagens novas"
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
        )}
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
            placeholder={ligado ? "Escreva uma mensagem (Enter envia, Shift+Enter quebra linha)" : "Agente fora do ar: não dá pra enviar agora"}
            className="ui-input max-h-40 min-h-10 flex-1 resize-none py-2"
            aria-label="Mensagem"
          />
          <button type="button" onClick={() => void enviar()} disabled={!ligado || !texto.trim() || enviando} className="ui-btn h-10 w-10 shrink-0 p-0" aria-label="Enviar">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </footer>

      {ampliada && <Ampliada m={ampliada} onFechar={() => setAmpliada(null)} />}
    </>
  );
}

function Balao({
  m,
  grupo,
  nomes,
  onAmpliar,
  onCarregou,
}: {
  m: WaMensagem;
  grupo: boolean;
  nomes: Map<string, string>;
  onAmpliar: (m: WaMensagem) => void;
  onCarregou: () => void;
}) {
  const meu = m.from_me;
  const hora = new Date(m.wa_timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const remetente = grupo && !meu && m.sender_jid ? nomes.get(m.sender_jid) || telefone(m.sender_jid) : null;
  const [verOriginal, setVerOriginal] = useState(false);

  return (
    <div className={`flex ${meu ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm shadow-sm sm:max-w-[70%] ${
          meu ? "rounded-br-md bg-[#d9fdd3] text-[#111b21]" : "rounded-bl-md bg-surface text-foreground"
        } ${m.apagada_em ? "ring-1 ring-status-danger/30" : ""}`}
      >
        {remetente && <p className="text-[11px] font-semibold text-gold-ink">{remetente}</p>}
        <Midia m={m} onAmpliar={onAmpliar} onCarregou={onCarregou} />
        {m.texto && <p className="whitespace-pre-wrap break-words">{verOriginal && m.texto_original ? m.texto_original : m.texto}</p>}
        <p className={`mt-0.5 flex flex-wrap items-center justify-end gap-1 text-[10px] ${meu ? "opacity-70" : "text-muted"}`}>
          {m.apagada_em && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-status-danger/10 px-1 font-medium text-status-danger"
              title={`Apagada no celular em ${new Date(m.apagada_em).toLocaleString("pt-BR")}. O portal guardou a original.`}
            >
              <Ban className="h-3 w-3" aria-hidden /> apagada no celular
            </span>
          )}
          {m.editada_em && (
            <button
              type="button"
              onClick={() => setVerOriginal((v) => !v)}
              className="inline-flex items-center gap-0.5 rounded bg-black/5 px-1 hover:bg-black/10"
              title={m.texto_original ? `Original: ${m.texto_original}` : "Editada no celular"}
            >
              <Pencil className="h-3 w-3" aria-hidden /> {verOriginal ? "ver atual" : "editada · ver original"}
            </button>
          )}
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

const ROTULO_MIDIA: Record<string, string> = {
  imagem: "📷 Foto",
  audio: "🎤 Áudio",
  video: "🎥 Vídeo",
  documento: "📄 Documento",
  figurinha: "Figurinha",
  localizacao: "📍 Localização",
  contato: "👤 Contato",
};

function Midia({ m, onAmpliar, onCarregou }: { m: WaMensagem; onAmpliar: (m: WaMensagem) => void; onCarregou: () => void }) {
  const url = m.media_url;
  if (m.tipo === "texto") return null;
  if (!url) {
    if (m.texto && (m.tipo === "localizacao" || m.tipo === "contato")) return null;
    const rotulo = m.tipo === "documento" ? `📄 ${m.media_nome ?? "Documento"}` : (ROTULO_MIDIA[m.tipo] ?? "Mensagem");
    return (
      <p className="mb-1 flex items-center gap-1.5 rounded-lg bg-black/5 px-2.5 py-2 text-xs italic opacity-80">
        {m.media_pendente && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />}
        <span>
          {rotulo}
          {m.media_pendente ? " · baixando do celular…" : m.media_erro ? " · não está mais disponível no WhatsApp" : ""}
        </span>
      </p>
    );
  }
  if (m.tipo === "imagem" || m.tipo === "figurinha")
    return (
      <button type="button" onClick={() => m.tipo === "imagem" && onAmpliar(m)} className="mb-1 block" aria-label="Ampliar imagem">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={m.tipo === "figurinha" ? "Figurinha" : "Imagem"}
          onLoad={onCarregou}
          className={m.tipo === "figurinha" ? "h-32 w-32 object-contain" : "max-h-72 rounded-lg"}
          loading="lazy"
        />
      </button>
    );
  if (m.tipo === "audio")
    return <audio controls src={url} onLoadedMetadata={onCarregou} className="mb-1 h-10 w-72 max-w-full" preload="metadata" />;
  if (m.tipo === "video")
    return <video controls src={url} onLoadedMetadata={onCarregou} className="mb-1 max-h-72 max-w-full rounded-lg" preload="metadata" />;
  return (
    <a
      href={m.media_download_url ?? url}
      target="_blank"
      rel="noreferrer"
      className="mb-1 flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 hover:bg-black/10"
    >
      <FileText className="h-5 w-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{m.media_nome ?? "Documento"}</span>
      <Download className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
    </a>
  );
}

/** Imagem em tela cheia (Esc ou clique fora fecha). */
function Ampliada({ m, onFechar }: { m: WaMensagem; onFechar: () => void }) {
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
