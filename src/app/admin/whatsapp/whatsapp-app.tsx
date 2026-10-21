"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BellOff, ChevronDown, Loader2, MessageCircle, Pin, RefreshCw, Search, SquarePen, Users } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { WaAgente, WaChat, WaContato } from "@/lib/whatsapp";
import { abrirContatoAction, linkFotoAction, listarContatosAction, listarConversasAction, listarTodasConversasAction, setTipoPessoaAction, statusAgenteAction } from "./actions";
import { tipoPessoaDaConversa, type TipoPessoa } from "@/lib/whatsapp-pessoa";
import { executarOrdem } from "./ordem";
import { BarraAgente } from "./agente-barra";
import { AvatarWa } from "./comum";
import { Conversa, ItemMenu, Menu } from "./conversa";
import { EscolherPessoas, PerfilPainel } from "./perfil";
import { ligadoAgora, ordenar, quando, telefone } from "./util";

// WhatsApp do escritório dentro do portal, ao vivo. As mensagens são backup
// permanente (apagar no celular não apaga aqui). Toda ação vira uma ordem em
// wa_jobs e o Agente MC (servidor 24h) executa no WhatsApp.

type Cliente = { id: string; name: string; tipo_pessoa?: string | null };
type Filtro = "todas" | "naoLidas" | "grupos" | "pf" | "pj" | "contatos" | "arquivadas";
const PAGINA = 300;

export function WhatsappApp({ agenteInicial, conversasIniciais, clientes }: { agenteInicial: WaAgente | null; conversasIniciais: WaChat[]; clientes: Cliente[] }) {
  const [supabase] = useState(() => createClient());
  const [agente, setAgente] = useState<WaAgente | null>(agenteInicial);
  const [, setTick] = useState(0);
  const [conversas, setConversas] = useState<WaChat[]>(conversasIniciais);
  const [fimDaLista, setFimDaLista] = useState(conversasIniciais.length < PAGINA);
  const [arquivadas, setArquivadas] = useState<WaChat[] | null>(null);
  const [contatos, setContatos] = useState<WaContato[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [perfil, setPerfil] = useState(false);
  const [busca, setBusca] = useState("");
  const [doServidor, setDoServidor] = useState<WaChat[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [novoGrupo, setNovoGrupo] = useState(false);
  const [versao, setVersao] = useState(0); // muda ao clicar em Atualizar: a conversa aberta recarrega
  const [atualizando, setAtualizando] = useState(false);

  /** Atualizar tudo na hora (lista, conversa aberta, status do número), sem recarregar a página. */
  async function atualizarTudo() {
    setAtualizando(true);
    try {
      const [pagina, ag, ctts] = await Promise.all([listarConversasAction({ offset: 0 }), statusAgenteAction(), listarContatosAction()]);
      setConversas((cs) => {
        const porJid = new Map(cs.map((c) => [c.chat_jid, c]));
        for (const c of pagina) porJid.set(c.chat_jid, c);
        return ordenar([...porJid.values()].filter((c) => !c.arquivado));
      });
      if (ag) setAgente(ag);
      setContatos(ctts);
      setArquivadas(null);
      setDoServidor([]);
      setVersao((v) => v + 1);
      toast.success("WhatsApp atualizado.");
    } catch {
      toast.error("Não foi possível atualizar agora.");
    } finally {
      setAtualizando(false);
    }
  }
  const conversasRef = useRef(conversas);
  useEffect(() => {
    conversasRef.current = conversas;
  }, [conversas]);

  const ligado = ligadoAgora(agente);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  // agenda (nomes de quem fala nos grupos, aba Contatos): depois da tela aparecer
  useEffect(() => {
    const t = setTimeout(() => void listarContatosAction().then(setContatos), 300);
    return () => clearTimeout(t);
  }, []);

  const nomes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contatos) {
      const n = c.nome || c.nome_perfil;
      if (n) m.set(c.jid, n);
    }
    for (const c of conversas) if (c.nome && !c.is_group) m.set(c.chat_jid, c.nome);
    return m;
  }, [contatos, conversas]);

  // foto de cada número (nas mensagens de grupo, ao lado do nome)
  const fotos = useMemo(() => new Map(conversas.filter((c) => !c.is_group).map((c) => [c.chat_jid, c.foto_url])), [conversas]);

  /* ───── tempo real: Agente e lista de conversas (em lote, pra não travar) ───── */
  useEffect(() => {
    let fila: WaChat[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const aplicar = () => {
      const lote = fila;
      fila = [];
      setConversas((cs) => {
        const porJid = new Map(cs.map((c) => [c.chat_jid, c]));
        for (const c of lote) {
          if (c.arquivado) porJid.delete(c.chat_jid);
          else porJid.set(c.chat_jid, c);
        }
        return ordenar([...porJid.values()]);
      });
    };
    const canal = supabase
      .channel("whatsapp-lista")
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_agent" }, (p) => {
        const novo = p.new as WaAgente;
        if (!novo?.device_id) return;
        setAgente((atual) =>
          !atual || atual.device_id === novo.device_id || (novo.last_heartbeat ?? "") > (atual.last_heartbeat ?? "") ? { ...novo, ligado: ligadoAgora(novo) } : atual
        );
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_chats" }, async (p) => {
        if (p.eventType === "DELETE") return;
        const c = p.new as WaChat;
        const antes = conversasRef.current.find((x) => x.chat_jid === c.chat_jid);
        let foto = c.foto_url;
        if (c.foto_url?.startsWith("vps:")) foto = antes?.foto_caminho === c.foto_url ? antes.foto_url : await linkFotoAction(c.foto_url);
        fila.push({ ...c, foto_url: foto, foto_caminho: c.foto_url, nao_lidas: aberta === c.chat_jid ? 0 : c.nao_lidas });
        clearTimeout(timer);
        timer = setTimeout(aplicar, 250);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(canal);
    };
  }, [supabase, aberta]);

  /* ───── busca no banco inteiro (o que não está carregado) ───── */
  const termo = busca.trim().toLowerCase();
  useEffect(() => {
    if (termo.length < 2) return;
    const t = setTimeout(async () => setDoServidor(await listarConversasAction({ busca: termo })), 350);
    return () => clearTimeout(t);
  }, [termo]);

  useEffect(() => {
    if (filtro === "arquivadas" && arquivadas === null) void listarConversasAction({ arquivadas: true }).then(setArquivadas);
  }, [filtro, arquivadas]);

  const tipoDoCliente = useMemo(() => {
    const m = new Map(clientes.map((c) => [c.id, c.tipo_pessoa ?? null]));
    return (id: string) => m.get(id);
  }, [clientes]);
  const tipoDe = useCallback((c: WaChat) => tipoPessoaDaConversa(c, tipoDoCliente), [tipoDoCliente]);

  // PF/PJ olha todas as conversas: carrega as que faltam uma vez só
  const carregandoTodas = (filtro === "pf" || filtro === "pj") && !fimDaLista;
  useEffect(() => {
    if (!carregandoTodas) return;
    void listarTodasConversasAction().then((todas) => {
      setConversas((cs) => {
        const porJid = new Map(todas.map((c) => [c.chat_jid, c]));
        for (const c of cs) porJid.set(c.chat_jid, c); // o que já está na tela vale (tempo real)
        return ordenar([...porJid.values()]);
      });
      setFimDaLista(true);
    });
  }, [carregandoTodas]);

  const marcarTipo = useCallback(async (jid: string, tipo: TipoPessoa | null) => {
    setConversas((cs) => cs.map((c) => (c.chat_jid === jid ? { ...c, tipo_pessoa: tipo } : c)));
    const r = await setTipoPessoaAction(jid, tipo);
    if (!r.ok) toast.error(r.erro ?? "Não foi possível salvar.");
    else toast.success(tipo ? `Marcada como ${tipo}.` : "Volta a ser automático.");
  }, []);

  const lista = useMemo(() => {
    if (filtro === "contatos") return [];
    const base = filtro === "arquivadas" ? (arquivadas ?? []) : conversas;
    const dig = termo.replace(/\D/g, "");
    let l = base.filter(
      (c) =>
        (filtro !== "naoLidas" || c.nao_lidas > 0) &&
        (filtro !== "grupos" || c.is_group) &&
        (filtro !== "pf" || tipoDe(c) === "PF") &&
        (filtro !== "pj" || tipoDe(c) === "PJ") &&
        (!termo || (c.nome ?? "").toLowerCase().includes(termo) || (dig.length >= 4 && c.chat_jid.includes(dig)))
    );
    if (termo.length >= 2 && filtro !== "arquivadas") {
      const ja = new Set(l.map((c) => c.chat_jid));
      l = [
        ...l,
        ...doServidor.filter(
          (c) =>
            !ja.has(c.chat_jid) &&
            (filtro !== "grupos" || c.is_group) &&
            (filtro !== "naoLidas" || c.nao_lidas > 0) &&
            (filtro !== "pf" || tipoDe(c) === "PF") &&
            (filtro !== "pj" || tipoDe(c) === "PJ")
        ),
      ];
    }
    return l;
  }, [conversas, arquivadas, filtro, termo, doServidor, tipoDe]);

  const contatosFiltrados = useMemo(() => {
    if (filtro !== "contatos") return [];
    const dig = termo.replace(/\D/g, "");
    return contatos.filter((c) => !termo || (c.nome ?? "").toLowerCase().includes(termo) || (c.nome_perfil ?? "").toLowerCase().includes(termo) || (dig.length >= 4 && c.jid.includes(dig)));
  }, [contatos, termo, filtro]);

  /* ───── abrir, carregar mais ───── */
  const chat = conversas.find((c) => c.chat_jid === aberta) ?? arquivadas?.find((c) => c.chat_jid === aberta) ?? doServidor.find((c) => c.chat_jid === aberta) ?? null;

  const abrir = useCallback((jid: string) => {
    setAberta(jid);
    setPerfil(false);
    setConversas((cs) => cs.map((c) => (c.chat_jid === jid ? { ...c, nao_lidas: 0 } : c)));
  }, []);

  const abrirContato = useCallback(
    async (jid: string, nome: string | null) => {
      const existe = conversasRef.current.find((x) => x.chat_jid === jid);
      if (!existe) {
        const novo = await abrirContatoAction(jid, nome);
        if (!novo) return void toast.error("Não foi possível abrir essa conversa.");
        setConversas((cs) => (cs.some((x) => x.chat_jid === novo.chat_jid) ? cs : ordenar([...cs, novo])));
      }
      setFiltro("todas");
      setBusca("");
      abrir(jid);
    },
    [abrir]
  );

  const carregandoMais = useRef(false);
  async function carregarMais() {
    if (carregandoMais.current || fimDaLista || termo || filtro === "arquivadas") return;
    carregandoMais.current = true;
    try {
      const mais = await listarConversasAction({ offset: conversasRef.current.length });
      if (mais.length < PAGINA) setFimDaLista(true);
      setConversas((cs) => {
        const ja = new Set(cs.map((c) => c.chat_jid));
        return [...cs, ...mais.filter((c) => !ja.has(c.chat_jid))];
      });
    } finally {
      carregandoMais.current = false;
    }
  }

  /** Fixar, arquivar, silenciar, marcar lida: muda na hora e o Agente faz no WhatsApp. */
  const ajustar = useCallback(
    async (jid: string, acao: "fixar" | "arquivar" | "silenciar" | "lida", valor: boolean) => {
      const campo = { fixar: { fixado: valor }, arquivar: { arquivado: valor }, silenciar: { silenciado: valor }, lida: { nao_lidas: valor ? 0 : 1 } }[acao];
      setConversas((cs) => {
        const c = cs.find((x) => x.chat_jid === jid) ?? arquivadas?.find((x) => x.chat_jid === jid);
        const resto = cs.filter((x) => x.chat_jid !== jid);
        if (!c) return cs;
        const novo = { ...c, ...campo };
        return acao === "arquivar" && valor ? resto : ordenar([...resto, novo]);
      });
      if (acao === "arquivar") setArquivadas((as) => (as === null ? null : valor ? as : as.filter((x) => x.chat_jid !== jid)));
      if (acao === "arquivar" && valor && aberta === jid) setAberta(null);
      const r = await executarOrdem("conversa", { chat_jid: jid, acao, valor }, { esperar: false });
      if (!r.ok) toast.error(r.erro ?? "Não deu certo.");
      else if (acao === "arquivar") toast.success(valor ? "Conversa arquivada." : "Conversa desarquivada.");
    },
    [aberta, arquivadas]
  );

  const totalNaoLidas = conversas.reduce((s, c) => s + (c.nao_lidas > 0 ? 1 : 0), 0);
  const FILTROS: { id: Filtro; rotulo: string }[] = [
    { id: "todas", rotulo: "Todas" },
    { id: "naoLidas", rotulo: `Não lidas${totalNaoLidas ? ` ${totalNaoLidas}` : ""}` },
    { id: "grupos", rotulo: "Grupos" },
    { id: "pf", rotulo: "PF" },
    { id: "pj", rotulo: "PJ" },
    { id: "contatos", rotulo: "Contatos" },
    { id: "arquivadas", rotulo: "Arquivadas" },
  ];

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[520px] flex-col">
      <div className="ui-card flex min-h-0 flex-1 overflow-hidden p-0">
        {/* lista */}
        <aside className={`${aberta ? "hidden md:flex" : "flex"} w-full flex-col border-r border-border md:w-[340px] lg:w-[380px] md:shrink-0`}>
          <div className="space-y-2 border-b border-border p-3">
            <div className="flex items-center gap-2">
              <label className="relative block flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={filtro === "contatos" ? "Buscar na agenda" : "Buscar conversa ou número"}
                  className="ui-input !rounded-full pl-9"
                  aria-label="Buscar"
                />
              </label>
              <button type="button" onClick={() => void atualizarTudo()} disabled={atualizando} className="icon-btn h-9 w-9" aria-label="Atualizar" data-tip="Atualizar">
                <RefreshCw className={atualizando ? "animate-spin" : ""} aria-hidden />
              </button>
              <button type="button" onClick={() => setNovoGrupo(true)} disabled={!ligado} className="icon-btn h-9 w-9" aria-label="Novo grupo" data-tip="Novo grupo">
                <SquarePen aria-hidden />
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 text-xs [scrollbar-width:none]">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  className={`shrink-0 rounded-full px-3 py-1 font-medium ${filtro === f.id ? "bg-navy text-white" : "bg-surface-2 text-muted hover:text-foreground"}`}
                >
                  {f.rotulo}
                </button>
              ))}
            </div>
          </div>

          {filtro === "contatos" ? (
            <ListaVirtual
              itens={contatosFiltrados}
              vazio={contatos.length ? "Nenhum contato encontrado." : "Carregando a agenda…"}
              chave={(c) => c.jid}
              render={(c) => {
                const nome = c.nome || c.nome_perfil || telefone(c.jid);
                return (
                  <button type="button" onClick={() => void abrirContato(c.jid, c.nome || c.nome_perfil)} className="flex h-full w-full items-center gap-3 px-3 text-left hover:bg-surface-2">
                    <AvatarWa nome={nome} grupo={false} foto={conversasRef.current.find((x) => x.chat_jid === c.jid)?.foto_url} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm text-foreground">{nome}</span>
                      <span className="block truncate text-xs text-muted">{telefone(c.jid)}</span>
                    </span>
                  </button>
                );
              }}
            />
          ) : (
            <ListaVirtual
              itens={lista}
              vazio={(filtro === "arquivadas" && arquivadas === null) || carregandoTodas ? "Carregando…" : conversas.length === 0 ? "Nenhuma conversa ainda. Conecte o número para trazer as conversas do celular." : "Nada encontrado."}
              chave={(c) => c.chat_jid}
              noFim={() => void carregarMais()}
              rodape={!fimDaLista && !termo && filtro === "todas"}
              render={(c) => (
                <LinhaConversa
                  c={c}
                  ativa={aberta === c.chat_jid}
                  cliente={c.client_id ? (clientes.find((x) => x.id === c.client_id)?.name ?? null) : null}
                  tipo={tipoDe(c)}
                  mostrarTipo={filtro !== "pf" && filtro !== "pj"}
                  onAbrir={abrir}
                  onAjustar={ajustar}
                  onTipo={marcarTipo}
                />
              )}
            />
          )}
        </aside>

        {/* conversa */}
        <section className={`${aberta ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 bg-surface-2/40`}>
          {!chat ? (
            <div className="m-auto max-w-xs p-6 text-center text-sm text-muted">
              <MessageCircle className="mx-auto mb-3 h-10 w-10 text-muted/50" aria-hidden />
              <p className="font-display text-base font-bold text-foreground">WhatsApp do escritório</p>
              <p className="mt-1">Escolha uma conversa. Para a IA agir (enviar relatório, resumir, triagem), use o assistente com Ctrl+J.</p>
            </div>
          ) : (
            <>
              <div className="flex min-w-0 flex-1 flex-col">
                <Conversa
                  key={`${chat.chat_jid}-${versao}`}
                  chat={chat}
                  nomes={nomes}
                  fotos={fotos}
                  ligado={ligado}
                  conversas={conversas}
                  onVoltar={() => setAberta(null)}
                  onPerfil={() => setPerfil((v) => !v)}
                  onAjustar={(acao, valor) => void ajustar(chat.chat_jid, acao, valor)}
                />
              </div>
              {perfil && (
                <PerfilPainel
                  key={`p-${chat.chat_jid}`}
                  chat={chat}
                  clientes={clientes}
                  nomes={nomes}
                  contatos={contatos}
                  onFechar={() => setPerfil(false)}
                  onAbrirConversa={(jid, nome) => void abrirContato(jid, nome)}
                  onVinculo={(clientId) => setConversas((cs) => cs.map((c) => (c.chat_jid === chat.chat_jid ? { ...c, client_id: clientId } : c)))}
                />
              )}
            </>
          )}
        </section>
      </div>

      <BarraAgente agente={agente} ligado={ligado} />

      {novoGrupo && (
        <NovoGrupo
          contatos={contatos}
          onFechar={() => setNovoGrupo(false)}
          onCriado={(jid, nome) => {
            setNovoGrupo(false);
            setConversas((cs) => ordenar([{ chat_jid: jid, nome, is_group: true, nao_lidas: 0, ultima_msg_em: new Date().toISOString() } as WaChat, ...cs.filter((c) => c.chat_jid !== jid)]));
            abrir(jid);
          }}
        />
      )}
    </div>
  );
}

/* ───────── lista virtual: só desenha o que está na tela ───────── */

function ListaVirtual<T>({
  itens,
  render,
  chave,
  vazio,
  noFim,
  rodape = false,
}: {
  itens: T[];
  render: (item: T) => React.ReactNode;
  chave: (item: T) => string;
  vazio: string;
  noFim?: () => void;
  rodape?: boolean;
}) {
  "use no memo"; // o otimizador do React não pode memorizar a lista virtual (ela não redesenhava)
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- @tanstack/react-virtual: uso padrão
  const v = useVirtualizer({ count: itens.length + (rodape ? 1 : 0), getScrollElement: () => ref.current, estimateSize: () => 72, overscan: 8 });
  const itensV = v.getVirtualItems();
  const ultimo = itensV[itensV.length - 1]?.index ?? 0;
  useEffect(() => {
    if (noFim && ultimo >= itens.length - 20) noFim();
  }, [ultimo, itens.length, noFim]);

  if (!itens.length) return <p className="p-6 text-center text-sm text-muted">{vazio}</p>;
  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {itensV.map((r) => (
          <div key={r.index < itens.length ? chave(itens[r.index]) : "rodape"} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: r.size, transform: `translateY(${r.start}px)` }}>
            {r.index < itens.length ? (
              render(itens[r.index])
            ) : (
              <div className="flex h-full items-center justify-center text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando mais conversas" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const LinhaConversa = memo(function LinhaConversa({
  c,
  ativa,
  cliente,
  tipo,
  mostrarTipo,
  onAbrir,
  onAjustar,
  onTipo,
}: {
  c: WaChat;
  ativa: boolean;
  cliente: string | null;
  tipo: TipoPessoa | null;
  mostrarTipo: boolean;
  onAbrir: (jid: string) => void;
  onAjustar: (jid: string, acao: "fixar" | "arquivar" | "silenciar" | "lida", valor: boolean) => void;
  onTipo: (jid: string, tipo: TipoPessoa | null) => void;
}) {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const nome = c.nome || telefone(c.chat_jid);
  return (
    <div
      className={`group relative flex h-full items-center gap-3 px-3 transition-colors hover:bg-surface-2 ${ativa ? "bg-surface-2" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(new DOMRect(e.clientX, e.clientY, 0, 0));
      }}
    >
      <button type="button" onClick={() => onAbrir(c.chat_jid)} className="absolute inset-0" aria-label={`Abrir conversa com ${nome}`} />
      <span className="pointer-events-none">
        <AvatarWa nome={nome} grupo={c.is_group} foto={c.foto_url} tamanho="h-12 w-12" />
      </span>
      <span className="pointer-events-none min-w-0 flex-1 border-b border-border/60 py-3">
        <span className="flex items-baseline gap-2">
          <span className={`truncate text-[15px] ${c.nao_lidas ? "font-semibold text-foreground" : "text-foreground"}`}>{nome}</span>
          <span className={`ml-auto shrink-0 text-[11px] ${c.nao_lidas ? "font-semibold text-status-success" : "text-muted"}`}>{quando(c.ultima_msg_em)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          {c.is_group && <Users className="h-3 w-3 shrink-0 text-muted" aria-hidden />}
          <span className="truncate text-[13px] text-muted">
            {mostrarTipo && tipo === "PJ" && <span className="mr-1 rounded bg-surface-2 px-1 py-px text-[10px] font-semibold text-foreground/70">PJ</span>}
            {cliente && <span className="mr-1 rounded bg-gold-soft px-1 py-px text-[10px] font-medium text-gold-ink">{cliente}</span>}
            {c.ultima_msg_preview ?? ""}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {c.silenciado && <BellOff className="h-3.5 w-3.5 text-muted" aria-label="Silenciada" />}
            {c.fixado && <Pin className="h-3.5 w-3.5 text-muted" aria-label="Fixada" />}
            {c.nao_lidas > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-status-success px-1.5 text-[11px] font-semibold text-white">{c.nao_lidas}</span>
            )}
          </span>
        </span>
      </span>
      <button
        type="button"
        onClick={(e) => setMenu((v) => (v ? null : e.currentTarget.getBoundingClientRect()))}
        className="relative z-10 -mr-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted group-hover:flex hover:bg-surface hover:text-foreground"
        aria-label="Opções da conversa"
      >
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {menu && (
        <Menu onFechar={() => setMenu(null)} ancora={menu}>
          <ItemMenu onClick={() => (setMenu(null), onAjustar(c.chat_jid, "fixar", !c.fixado))}>{c.fixado ? "Desafixar" : "Fixar conversa"}</ItemMenu>
          <ItemMenu onClick={() => (setMenu(null), onAjustar(c.chat_jid, "lida", c.nao_lidas > 0))}>{c.nao_lidas > 0 ? "Marcar como lida" : "Marcar como não lida"}</ItemMenu>
          <ItemMenu onClick={() => (setMenu(null), onAjustar(c.chat_jid, "silenciar", !c.silenciado))}>{c.silenciado ? "Reativar notificações" : "Silenciar (8 h)"}</ItemMenu>
          <ItemMenu onClick={() => (setMenu(null), onAjustar(c.chat_jid, "arquivar", !c.arquivado))}>{c.arquivado ? "Desarquivar" : "Arquivar conversa"}</ItemMenu>
          <div className="my-1 border-t border-border" />
          <p className="px-3 pt-1 pb-0.5 text-[11px] text-muted">
            É {tipo ?? "—"}
            {c.tipo_pessoa ? " (marcado)" : " (automático)"}
          </p>
          {tipo !== "PF" && <ItemMenu onClick={() => (setMenu(null), onTipo(c.chat_jid, "PF"))}>Marcar como PF (pessoa física)</ItemMenu>}
          {tipo !== "PJ" && <ItemMenu onClick={() => (setMenu(null), onTipo(c.chat_jid, "PJ"))}>Marcar como PJ (empresa)</ItemMenu>}
          {c.tipo_pessoa && <ItemMenu onClick={() => (setMenu(null), onTipo(c.chat_jid, null))}>Voltar ao automático</ItemMenu>}
        </Menu>
      )}
    </div>
  );
});

function NovoGrupo({ contatos, onFechar, onCriado }: { contatos: WaContato[]; onFechar: () => void; onCriado: (jid: string, nome: string) => void }) {
  const [nome, setNome] = useState("");
  return (
    <EscolherPessoas
      titulo="Novo grupo"
      botao="Criar grupo"
      contatos={contatos}
      onFechar={onFechar}
      extra={<input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} placeholder="Nome do grupo" className="ui-input" aria-label="Nome do grupo" />}
      onConfirmar={async (pessoas) => {
        if (!nome.trim()) return void toast.error("Dê um nome ao grupo.");
        const r = await executarOrdem("grupo", { acao: "criar", assunto: nome.trim(), participantes: pessoas });
        if (!r.ok) return void toast.error(r.erro);
        toast.success("Grupo criado.");
        onCriado(String(r.resultado?.jid), nome.trim());
      }}
    />
  );
}
