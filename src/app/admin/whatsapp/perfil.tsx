"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Crown, Download, FileText, Link2, Loader2, LogOut, MoreVertical, Pencil, Power, RefreshCw, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import type { WaChat, WaContato, WaMensagem } from "@/lib/whatsapp";
import { midiasDaConversaAction, setLerDemandasAction, vincularClienteAction } from "./actions";
import { executarOrdem } from "./ordem";
import { AvatarWa } from "./comum";
import { ItemMenu, Menu } from "./conversa";
import { telefone } from "./util";

type Participante = { jid: string; nome: string | null; admin: string | null; eu: boolean };
type InfoGrupo = {
  assunto: string;
  descricao: string | null;
  criado_em: string | null;
  dono: string | null;
  so_admins_enviam: boolean;
  so_admins_editam: boolean;
  participantes: Participante[];
  sou_admin: boolean;
  convite: string | null;
  foto: string | null;
};
type InfoContato = { foto: string | null; recado: string | null; recado_em: string | null; empresa: { descricao: string | null; email: string | null; site: string | null; endereco: string | null; categoria: string | null } | null };

/**
 * Dados do contato ou do grupo (lado direito). No grupo, quem é admin no
 * WhatsApp gerencia participantes, nome, descrição, convite e permissões.
 * Ações que mexem com o cliente pedem confirmação (e ficam registradas no portal).
 */
export function PerfilPainel({
  chat,
  clientes,
  nomes,
  contatos,
  onFechar,
  onAbrirConversa,
  onVinculo,
}: {
  chat: WaChat;
  clientes: { id: string; name: string }[];
  nomes: Map<string, string>;
  contatos: WaContato[];
  onFechar: () => void;
  onAbrirConversa: (jid: string, nome: string | null) => void;
  onVinculo: (clientId: string | null) => void;
}) {
  const jid = chat.chat_jid;
  const nome = chat.nome || telefone(jid);
  const [grupo, setGrupo] = useState<InfoGrupo | null>(null);
  const [contato, setContato] = useState<InfoContato | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [midias, setMidias] = useState<WaMensagem[]>([]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    void midiasDaConversaAction(jid).then(setMidias); // mídias chegam por conta própria
    const r = await executarOrdem(chat.is_group ? "grupo_info" : "perfil_contato", { jid });
    if (!r.ok) setErro(r.erro ?? "Não foi possível carregar.");
    else if (chat.is_group) setGrupo(r.resultado as unknown as InfoGrupo);
    else setContato(r.resultado as unknown as InfoContato);
    setCarregando(false);
  }, [jid, chat.is_group]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const foto = grupo?.foto ?? contato?.foto ?? chat.foto_url;

  return (
    <aside className="absolute inset-0 z-20 flex flex-col border-l border-border bg-surface md:static md:w-[380px] md:shrink-0" aria-label={chat.is_group ? "Dados do grupo" : "Dados do contato"}>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <button type="button" onClick={onFechar} className="icon-btn" aria-label="Fechar">
          <X aria-hidden />
        </button>
        <p className="flex-1 text-sm font-semibold text-foreground">{chat.is_group ? "Dados do grupo" : "Dados do contato"}</p>
        <button type="button" onClick={() => void carregar()} className="icon-btn" aria-label="Atualizar" data-tip="Atualizar">
          <RefreshCw aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-2 border-b border-border px-4 py-6 text-center">
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <a href={foto} target="_blank" rel="noreferrer">
              <img src={foto} alt="" className="h-36 w-36 rounded-full object-cover" />
            </a>
          ) : (
            <AvatarWa nome={nome} grupo={chat.is_group} tamanho="h-36 w-36" />
          )}
          {chat.is_group && grupo ? <EditavelGrupo jid={jid} valor={grupo.assunto} campo="assunto" pode={grupo.sou_admin || !grupo.so_admins_editam} onSalvo={(v) => setGrupo({ ...grupo, assunto: v })} grande /> : <p className="font-display text-xl font-bold text-foreground">{nome}</p>}
          <p className="text-sm text-muted">{chat.is_group ? (grupo ? `Grupo · ${grupo.participantes.length} participantes` : "Grupo") : telefone(jid)}</p>
        </div>

        {carregando && (
          <div className="flex justify-center py-8 text-muted">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" />
          </div>
        )}
        {erro && <p className="px-4 py-4 text-sm text-status-danger">{erro}</p>}

        {/* contato */}
        {!chat.is_group && contato && (
          <Secao titulo="Recado">
            <p className="text-sm text-foreground">{contato.recado || <span className="text-muted">Sem recado.</span>}</p>
            {contato.empresa && (
              <dl className="mt-3 space-y-1 text-sm">
                {contato.empresa.categoria && <Linha k="Categoria" v={contato.empresa.categoria} />}
                {contato.empresa.descricao && <Linha k="Sobre a empresa" v={contato.empresa.descricao} />}
                {contato.empresa.endereco && <Linha k="Endereço" v={contato.empresa.endereco} />}
                {contato.empresa.email && <Linha k="E-mail" v={contato.empresa.email} />}
                {contato.empresa.site && <Linha k="Site" v={contato.empresa.site} />}
              </dl>
            )}
          </Secao>
        )}

        {/* grupo */}
        {chat.is_group && grupo && (
          <>
            <Secao titulo="Descrição">
              <EditavelGrupo jid={jid} valor={grupo.descricao ?? ""} campo="descricao" pode={grupo.sou_admin || !grupo.so_admins_editam} onSalvo={(v) => setGrupo({ ...grupo, descricao: v })} multilinha />
              {grupo.criado_em && (
                <p className="mt-2 text-xs text-muted">
                  Criado em {new Date(grupo.criado_em).toLocaleDateString("pt-BR")}
                  {grupo.dono ? ` por ${nomes.get(grupo.dono) || telefone(grupo.dono)}` : ""}
                </p>
              )}
            </Secao>
            {grupo.sou_admin && <ConfigGrupo jid={jid} grupo={grupo} onMudou={setGrupo} />}
            <Participantes jid={jid} grupo={grupo} nomes={nomes} contatos={contatos} onMudou={() => void carregar()} onAbrirConversa={onAbrirConversa} />
          </>
        )}

        {/* cliente vinculado (contato) */}
        {!chat.is_group && (
          <Secao titulo="Cliente do portal">
            <div className="flex items-center gap-2">
              <select
                value={chat.client_id ?? ""}
                onChange={async (e) => {
                  const id = e.target.value || null;
                  onVinculo(id);
                  await vincularClienteAction(jid, id);
                  toast.success(id ? "Conversa ligada ao cliente." : "Vínculo removido.");
                }}
                className="ui-input !py-1.5 text-sm"
                aria-label="Cliente vinculado a esta conversa"
              >
                <option value="">Sem cliente vinculado</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {chat.client_id && (
                <Link href={`/admin/clients/${chat.client_id}`} className="ui-link shrink-0 text-xs">
                  Ficha
                </Link>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted">A Distribuição lê as mensagens de conversas ligadas a um cliente.</p>
          </Secao>
        )}

        <LeituraDistribuicao key={jid} jid={jid} chat={chat} />

        {/* mídias e documentos */}
        <Secao titulo={`Mídias e documentos${midias.length ? ` · ${midias.length}` : ""}`}>
          {midias.length === 0 ? (
            <p className="text-sm text-muted">Nada por aqui ainda.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1">
                {midias
                  .filter((m) => m.tipo === "imagem" && m.media_url)
                  .slice(0, 12)
                  .map((m) => (
                    <a key={m.id} href={m.media_download_url ?? m.media_url!} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-surface-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.media_url!} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </a>
                  ))}
              </div>
              <ul className="mt-2 divide-y divide-border">
                {midias
                  .filter((m) => m.tipo !== "imagem")
                  .slice(0, 20)
                  .map((m) => (
                    <li key={m.id}>
                      <a href={m.media_download_url ?? m.media_url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-2 text-sm hover:text-navy-3">
                        <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{m.media_nome ?? (m.tipo === "audio" ? "Áudio" : m.tipo === "video" ? "Vídeo" : "Arquivo")}</span>
                        <span className="shrink-0 text-[11px] text-muted">{new Date(m.wa_timestamp).toLocaleDateString("pt-BR")}</span>
                        <Download className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                      </a>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </Secao>

        {chat.is_group && grupo && <SairEncerrar jid={jid} grupo={grupo} onFeito={onFechar} />}
      </div>
    </aside>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-4">
      <p className="eyebrow mb-2">{titulo}</p>
      {children}
    </section>
  );
}
function Linha({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}

/** Nome ou descrição do grupo, com lápis pra editar (se o WhatsApp deixar). */
function EditavelGrupo({
  jid,
  valor,
  campo,
  pode,
  onSalvo,
  grande = false,
  multilinha = false,
}: {
  jid: string;
  valor: string;
  campo: "assunto" | "descricao";
  pode: boolean;
  onSalvo: (v: string) => void;
  grande?: boolean;
  multilinha?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    const r = await executarOrdem("grupo", { jid, acao: campo, texto: texto.trim() });
    setSalvando(false);
    if (!r.ok) return void toast.error(r.erro);
    onSalvo(texto.trim());
    setEditando(false);
    toast.success(campo === "assunto" ? "Nome do grupo alterado." : "Descrição alterada.");
  }
  if (editando)
    return (
      <div className="flex w-full items-start gap-1.5">
        {multilinha ? (
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={2048} className="ui-input text-sm" autoFocus />
        ) : (
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={100} className="ui-input text-sm" autoFocus />
        )}
        <button type="button" onClick={() => void salvar()} disabled={salvando} className="ui-btn px-3 py-1.5 text-xs">
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Salvar"}
        </button>
      </div>
    );
  return (
    <div className={`group flex w-full items-start gap-1.5 ${grande ? "justify-center" : ""}`}>
      <p className={`${grande ? "font-display text-xl font-bold" : "text-sm"} whitespace-pre-wrap text-foreground`}>{valor || <span className="text-muted">Sem descrição.</span>}</p>
      {pode && (
        <button type="button" onClick={() => (setTexto(valor), setEditando(true))} className="icon-btn shrink-0" aria-label="Editar">
          <Pencil aria-hidden />
        </button>
      )}
    </div>
  );
}

function ConfigGrupo({ jid, grupo, onMudou }: { jid: string; grupo: InfoGrupo; onMudou: (g: InfoGrupo) => void }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  async function config(valor: string, campo: "so_admins_enviam" | "so_admins_editam", novo: boolean) {
    setOcupado(campo);
    const r = await executarOrdem("grupo", { jid, acao: "config", valor });
    setOcupado(null);
    if (!r.ok) return void toast.error(r.erro);
    onMudou({ ...grupo, [campo]: novo });
  }
  async function novoConvite() {
    if (!confirm("Gerar um link novo? O link atual para de funcionar.")) return;
    setOcupado("convite");
    const r = await executarOrdem("grupo", { jid, acao: "convite_novo" });
    setOcupado(null);
    if (!r.ok) return void toast.error(r.erro);
    onMudou({ ...grupo, convite: String(r.resultado?.convite ?? grupo.convite) });
    toast.success("Link novo gerado.");
  }
  return (
    <Secao titulo="Configurações do grupo (você é admin)">
      <Alternar rotulo="Só admins enviam mensagens" on={grupo.so_admins_enviam} ocupado={ocupado === "so_admins_enviam"} onChange={(v) => void config(v ? "announcement" : "not_announcement", "so_admins_enviam", v)} />
      <Alternar rotulo="Só admins editam os dados do grupo" on={grupo.so_admins_editam} ocupado={ocupado === "so_admins_editam"} onChange={(v) => void config(v ? "locked" : "unlocked", "so_admins_editam", v)} />
      {grupo.convite && (
        <div className="mt-3 rounded-xl border border-border p-2.5">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Link2 className="h-3.5 w-3.5" aria-hidden /> Link de convite
          </p>
          <p className="mt-1 truncate text-sm text-foreground">{grupo.convite}</p>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(grupo.convite!);
                toast.success("Link copiado.");
              }}
              className="ui-btn-secondary px-3 py-1 text-xs"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copiar
            </button>
            <button type="button" onClick={() => void novoConvite()} disabled={ocupado === "convite"} className="ui-btn-secondary px-3 py-1 text-xs">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Gerar novo
            </button>
          </div>
        </div>
      )}
    </Secao>
  );
}

function Alternar({ rotulo, on, ocupado, onChange }: { rotulo: string; on: boolean; ocupado: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm text-foreground">
      {rotulo}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={ocupado}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? "bg-navy-3" : "bg-border-strong"}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function Participantes({
  jid,
  grupo,
  nomes,
  contatos,
  onMudou,
  onAbrirConversa,
}: {
  jid: string;
  grupo: InfoGrupo;
  nomes: Map<string, string>;
  contatos: WaContato[];
  onMudou: () => void;
  onAbrirConversa: (jid: string, nome: string | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const [menu, setMenu] = useState<{ jid: string; rect: DOMRect } | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  const nomeDe = (p: Participante) => (p.eu ? "Você" : p.nome || nomes.get(p.jid) || telefone(p.jid));
  const termo = busca.trim().toLowerCase();
  const lista = useMemo(
    () =>
      [...grupo.participantes]
        .sort((a, b) => Number(b.eu) - Number(a.eu) || Number(!!b.admin) - Number(!!a.admin) || nomeDe(a).localeCompare(nomeDe(b)))
        .filter((p) => !termo || nomeDe(p).toLowerCase().includes(termo) || p.jid.includes(termo.replace(/\D/g, "") || "§")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grupo.participantes, termo, nomes]
  );

  async function mudar(p: Participante, operacao: "remove" | "promote" | "demote") {
    const n = nomeDe(p);
    const textos = { remove: `Remover ${n} do grupo?`, promote: `Tornar ${n} admin do grupo?`, demote: `Tirar ${n} de admin?` };
    if (!confirm(textos[operacao])) return;
    const r = await executarOrdem("grupo", { jid, acao: "participantes", operacao, participantes: [p.jid] });
    if (!r.ok) return void toast.error(r.erro);
    toast.success(operacao === "remove" ? `${n} removido(a).` : operacao === "promote" ? `${n} agora é admin.` : `${n} não é mais admin.`);
    onMudou();
  }

  return (
    <Secao titulo={`${grupo.participantes.length} participantes`}>
      {grupo.sou_admin && (
        <button type="button" onClick={() => setAdicionando(true)} className="mb-2 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-foreground hover:bg-surface-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-white">
            <UserPlus className="h-4 w-4" aria-hidden />
          </span>
          Adicionar participante
        </button>
      )}
      <label className="relative mb-1 block">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar participante" className="ui-input !py-1.5 pl-8 text-sm" aria-label="Buscar participante" />
      </label>
      <ul>
        {lista.map((p) => (
          <li key={p.jid} className="relative flex items-center gap-2.5 rounded-xl px-1 py-1.5 hover:bg-surface-2">
            <AvatarWa nome={nomeDe(p)} grupo={false} tamanho="h-9 w-9" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm text-foreground">{nomeDe(p)}</span>
              <span className="block truncate text-xs text-muted">{telefone(p.jid)}</span>
            </span>
            {p.admin && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-semibold text-gold-ink">
                <Crown className="h-3 w-3" aria-hidden /> {p.admin === "superadmin" ? "Criador" : "Admin"}
              </span>
            )}
            {!p.eu && (
              <button type="button" onClick={(e) => setMenu(menu?.jid === p.jid ? null : { jid: p.jid, rect: e.currentTarget.getBoundingClientRect() })} className="icon-btn shrink-0" aria-label={`Opções de ${nomeDe(p)}`}>
                <MoreVertical aria-hidden />
              </button>
            )}
            {menu?.jid === p.jid && (
              <Menu onFechar={() => setMenu(null)} ancora={menu.rect}>
                <ItemMenu onClick={() => (setMenu(null), onAbrirConversa(p.jid, p.nome))}>Conversar com {nomeDe(p).split(" ")[0]}</ItemMenu>
                {grupo.sou_admin && (
                  <>
                    {p.admin ? (
                      p.admin !== "superadmin" && <ItemMenu onClick={() => (setMenu(null), void mudar(p, "demote"))}>Tirar de admin</ItemMenu>
                    ) : (
                      <ItemMenu onClick={() => (setMenu(null), void mudar(p, "promote"))}>Tornar admin do grupo</ItemMenu>
                    )}
                    {p.admin !== "superadmin" && (
                      <ItemMenu perigo onClick={() => (setMenu(null), void mudar(p, "remove"))}>
                        Remover do grupo
                      </ItemMenu>
                    )}
                  </>
                )}
              </Menu>
            )}
          </li>
        ))}
      </ul>
      {adicionando && (
        <EscolherPessoas
          titulo="Adicionar ao grupo"
          botao="Adicionar"
          contatos={contatos}
          jaEstao={new Set(grupo.participantes.map((p) => p.jid))}
          onFechar={() => setAdicionando(false)}
          onConfirmar={async (pessoas) => {
            const r = await executarOrdem("grupo", { jid, acao: "participantes", operacao: "add", participantes: pessoas });
            if (!r.ok) return toast.error(r.erro);
            const res = (r.resultado?.resultado as { status?: string }[] | undefined) ?? [];
            const falhas = res.filter((x) => x.status && x.status !== "200").length;
            toast.success(falhas ? `Adicionado(s), mas ${falhas} não entrou(aram) (privacidade da pessoa: ela recebe convite).` : "Adicionado(s) ao grupo.");
            setAdicionando(false);
            onMudou();
          }}
        />
      )}
    </Secao>
  );
}

/** Escolher pessoas da agenda ou digitar números (adicionar ao grupo, criar grupo). */
export function EscolherPessoas({
  titulo,
  botao,
  contatos,
  jaEstao = new Set(),
  onFechar,
  onConfirmar,
  extra,
}: {
  titulo: string;
  botao: string;
  contatos: WaContato[];
  jaEstao?: Set<string>;
  onFechar: () => void;
  onConfirmar: (pessoas: string[]) => Promise<unknown> | void;
  extra?: React.ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const termo = busca.trim().toLowerCase();
  const dig = termo.replace(/\D/g, "");
  const lista = contatos
    .filter((c) => !jaEstao.has(c.jid) && (!termo || (c.nome ?? c.nome_perfil ?? "").toLowerCase().includes(termo) || (dig.length >= 4 && c.jid.includes(dig))))
    .slice(0, 100);
  const numeroDigitado = dig.length >= 10 && !lista.some((c) => c.jid.startsWith(dig)) ? dig : null;
  const alternar = (j: string) => setSel((s) => (s.includes(j) ? s.filter((x) => x !== j) : [...s, j]));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={titulo} onClick={onFechar}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border p-3">
          <p className="flex-1 font-semibold text-foreground">{titulo}</p>
          <button type="button" onClick={onFechar} className="icon-btn" aria-label="Fechar">
            <X aria-hidden />
          </button>
        </div>
        <div className="space-y-2 p-3">
          {extra}
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome da agenda ou número com DDD" className="ui-input" aria-label="Buscar pessoa" />
          {sel.length > 0 && <p className="text-xs text-muted">{sel.length} selecionada(s)</p>}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {numeroDigitado && (
            <li>
              <button type="button" onClick={() => (alternar(numeroDigitado), setBusca(""))} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2">
                <UserPlus className="h-4 w-4 text-navy-3" aria-hidden /> Usar o número {numeroDigitado}
              </button>
            </li>
          )}
          {sel.filter((s) => !s.includes("@")).map((n) => (
            <li key={n} className="flex items-center gap-3 px-3 py-2 text-sm">
              <input type="checkbox" checked onChange={() => alternar(n)} className="h-4 w-4 accent-[var(--navy)]" />
              {n}
            </li>
          ))}
          {lista.map((c) => {
            const on = sel.includes(c.jid);
            const nome = c.nome || c.nome_perfil || telefone(c.jid);
            return (
              <li key={c.jid}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2">
                  <input type="checkbox" checked={on} onChange={() => alternar(c.jid)} className="h-4 w-4 accent-[var(--navy)]" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm">{nome}</span>
                    <span className="block truncate text-xs text-muted">{telefone(c.jid)}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2 border-t border-border p-3">
          <button
            type="button"
            disabled={!sel.length || enviando}
            onClick={async () => {
              setEnviando(true);
              try {
                await onConfirmar(sel);
              } finally {
                setEnviando(false);
              }
            }}
            className="ui-btn"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {botao}
          </button>
        </div>
      </div>
    </div>
  );
}

function SairEncerrar({ jid, grupo, onFeito }: { jid: string; grupo: InfoGrupo; onFeito: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  async function sair() {
    if (!confirm(`Sair do grupo "${grupo.assunto}"? O número do escritório deixa de receber as mensagens dele.`)) return;
    setOcupado(true);
    const r = await executarOrdem("grupo", { jid, acao: "sair" });
    setOcupado(false);
    if (!r.ok) return void toast.error(r.erro);
    toast.success("Você saiu do grupo.");
    onFeito();
  }
  async function encerrar() {
    const digitado = prompt(
      `ENCERRAR o grupo tira TODOS os ${grupo.participantes.length - 1} participantes e o escritório sai (o WhatsApp não tem "apagar grupo").\n\nPara confirmar, digite o nome do grupo:\n${grupo.assunto}`
    );
    if (digitado === null) return;
    if (digitado.trim() !== grupo.assunto.trim()) return void toast.error("O nome não confere. Nada foi feito.");
    setOcupado(true);
    const r = await executarOrdem("grupo", { jid, acao: "encerrar" });
    setOcupado(false);
    if (!r.ok) return void toast.error(r.erro);
    toast.success(`Grupo encerrado (${String(r.resultado?.removidos ?? 0)} removidos).`);
    onFeito();
  }
  return (
    <section className="space-y-1 px-4 py-4">
      <button type="button" onClick={() => void sair()} disabled={ocupado} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-status-danger hover:bg-status-danger-bg">
        <LogOut className="h-4 w-4" aria-hidden /> Sair do grupo
      </button>
      {grupo.sou_admin && (
        <button type="button" onClick={() => void encerrar()} disabled={ocupado} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-status-danger hover:bg-status-danger-bg">
          <Power className="h-4 w-4" aria-hidden /> Encerrar grupo (tirar todos e sair)
        </button>
      )}
    </section>
  );
}

/** Liga/desliga a leitura 24h desta conversa para a Distribuição (mesmo sem cliente). */
function LeituraDistribuicao({ jid, chat }: { jid: string; chat: WaChat }) {
  const automatico = !!chat.client_id || (chat.is_group && /assessoria\s+juridica/.test((chat.nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()));
  const [valor, setValor] = useState<boolean | null>(chat.ler_demandas ?? null);
  const [ocupado, setOcupado] = useState(false);
  const ligado = valor ?? automatico;
  async function mudar(v: boolean) {
    setOcupado(true);
    // voltar ao padrão automático quando coincide com ele
    const novo = v === automatico ? null : v;
    const r = await setLerDemandasAction(jid, novo);
    setOcupado(false);
    if (!r.ok) return void toast.error(r.erro ?? "Não deu certo.");
    setValor(novo);
    toast.success(v ? "A Distribuição vai ler esta conversa." : "A Distribuição não lê mais esta conversa.");
  }
  return (
    <Secao titulo="Distribuição">
      <Alternar rotulo="Ler mensagens e gerar demandas (24h)" on={ligado} ocupado={ocupado} onChange={(v) => void mudar(v)} />
      <p className="mt-1 text-xs text-muted">
        {ligado
          ? "A IA lê as mensagens novas e coloca os pedidos na Distribuição, mesmo sem cliente vinculado."
          : "Esta conversa não gera demandas."}
      </p>
    </Secao>
  );
}
