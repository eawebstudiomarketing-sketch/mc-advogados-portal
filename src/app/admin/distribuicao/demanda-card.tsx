"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { MessageCircle, Globe, Newspaper, CheckCheck, X, ExternalLink, ChevronDown } from "lucide-react";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";
import { Avatar } from "@/components/ui/avatar";
import { distribuirAction, mudarStatusDistribuicaoAction, type DistribuirState } from "./actions";

export type DemandaSerial = {
  id: string;
  origem: string;
  status: string;
  titulo: string;
  descricao: string | null;
  area: string | null;
  tipo: string | null;
  prioridade: string;
  prazo: string | null;
  responsavelSugerido: string | null;
  cliente: { id: string; nome: string } | null;
  atividade: { id: string; titulo: string } | null;
  publicacao: { id: string; link: string | null } | null;
  chatJid?: string | null;
  trechos: { texto: string; quem?: string | null; em?: string | null }[];
  criadoEm: string;
};

const ORIGEM: Record<string, { rotulo: string; icone: typeof Globe; cor: string }> = {
  whatsapp: { rotulo: "WhatsApp", icone: MessageCircle, cor: "bg-zap-bg text-zap-ink" },
  portal_cliente: { rotulo: "Portal do cliente", icone: Globe, cor: "bg-status-info-bg text-status-info" },
  publicacao: { rotulo: "Publicação", icone: Newspaper, cor: "bg-gold-soft text-gold-ink" },
  email: { rotulo: "E-mail", icone: Globe, cor: "bg-surface-2 text-muted" },
  outro: { rotulo: "Outro", icone: Globe, cor: "bg-surface-2 text-muted" },
};
const PRIORIDADE: Record<string, { rotulo: string; cor: string }> = {
  alta: { rotulo: "Alta", cor: "bg-status-danger" },
  media: { rotulo: "Média", cor: "bg-status-pending" },
  baixa: { rotulo: "Baixa", cor: "bg-border-strong" },
};

function haQuanto(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit" });
}

/** 18/11/2026: quanto tempo a última mensagem do WhatsApp levou para virar esta demanda. */
function tempoParaVirar(d: DemandaSerial): { texto: string; cor: string } | null {
  if (d.origem !== "whatsapp") return null;
  const ems = d.trechos.map((t) => (t.em ? Date.parse(t.em) : NaN)).filter((x) => !Number.isNaN(x));
  if (!ems.length) return null;
  const seg = Math.max(0, Math.round((Date.parse(d.criadoEm) - Math.max(...ems)) / 1000));
  const texto = seg < 60 ? `${seg} s` : seg < 3600 ? `${Math.round(seg / 60)} min` : seg < 86_400 ? `${Math.floor(seg / 3600)} h ${String(Math.round((seg % 3600) / 60)).padStart(2, "0")}` : `${Math.round(seg / 86_400)} d`;
  const cor = seg <= 300 ? "bg-status-success-bg text-status-success" : seg <= 3600 ? "bg-status-pending-bg text-status-pending" : "bg-status-danger-bg text-status-danger";
  return { texto, cor };
}

const campo = "h-9 rounded-full border border-border bg-surface px-3 text-[13px] text-foreground hover:border-border-strong focus:border-navy-3 focus:outline-none";

export function DemandaCard({
  d,
  areas,
  responsaveis,
  clientes,
}: {
  d: DemandaSerial;
  areas: string[];
  responsaveis: { id: string; nome: string; areas: string[]; foto: string | null }[];
  clientes: { id: string; nome: string }[];
}) {
  const [state, action, pending] = useActionState<DistribuirState, FormData>(distribuirAction, { error: null });
  const [area, setArea] = useState(d.area ?? "");
  const [resp, setResp] = useState(d.responsavelSugerido ?? "");
  const o = ORIGEM[d.origem] ?? ORIGEM.outro;
  const Icone = o.icone;
  const pr = PRIORIDADE[d.prioridade] ?? PRIORIDADE.media;
  const daArea = (r: { areas: string[] }) => !!area && r.areas.some((a) => a.toLowerCase() === area.toLowerCase());
  const ordenados = [...responsaveis].sort((a, b) => Number(daArea(b)) - Number(daArea(a)) || a.nome.localeCompare(b.nome));
  const escolhido = responsaveis.find((r) => r.id === resp);
  // descartar some na hora (antes esperava a página inteira recarregar e parecia travado)
  const [descartada, setDescartada] = useState(false);
  const [, startDescarte] = useTransition();
  function mudarStatus(status: "descartada" | "pendente") {
    setDescartada(status === "descartada");
    const fd = new FormData();
    fd.set("id", d.id);
    fd.set("status", status);
    startDescarte(async () => {
      try {
        await mudarStatusDistribuicaoAction(fd);
      } catch {
        setDescartada(status !== "descartada");
        toast.error("Não foi possível salvar. Tente de novo.");
      }
    });
  }

  if (descartada) {
    return (
      <li className="ui-card flex items-center gap-3 px-5 py-3 text-sm text-muted">
        <X className="h-4 w-4" aria-hidden /> Descartada: <span className="min-w-0 flex-1 truncate">{d.titulo}</span>
        <button type="button" onClick={() => mudarStatus("pendente")} className="ui-link shrink-0">
          Desfazer
        </button>
      </li>
    );
  }

  if (state.ok) {
    return (
      <li className="ui-card flex items-center gap-3 px-5 py-4 text-sm text-status-success">
        <CheckCheck className="h-4 w-4" aria-hidden /> Virou atividade de {escolhido?.nome ?? "responsável"}.
      </li>
    );
  }

  return (
    <li id={`d-${d.id}`} className="ui-card scroll-mt-24 overflow-hidden target:ring-2 target:ring-gold">
      <form action={action}>
        <input type="hidden" name="id" value={d.id} />
        <input type="hidden" name="descricao" value={[d.descricao, ...d.trechos.map((t) => `${t.quem ?? "Cliente"}: ${t.texto}`)].filter(Boolean).join("\n\n")} />

        <div className="flex items-start gap-4 p-5">
          <input type="checkbox" name="id-lote" value={d.id} form="distribuicao-lote" aria-label={`Selecionar ${d.titulo}`} className="mt-3 h-4 w-4 shrink-0 accent-[var(--navy)]" />
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${o.cor}`} title={o.rotulo}>
            <Icone className="h-[18px] w-[18px]" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="eyebrow">{o.rotulo}</span>
              <span className="eyebrow">· {haQuanto(d.criadoEm)}</span>
              {(() => {
                const t = tempoParaVirar(d);
                return t ? (
                  <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums ${t.cor}`} title="Tempo da última mensagem no WhatsApp até virar esta demanda" data-tip="Tempo da mensagem até virar demanda">
                    ⚡ {t.texto}
                  </span>
                ) : null;
              })()}
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/70">
                <span className={`h-1.5 w-1.5 rounded-full ${pr.cor}`} aria-hidden /> {pr.rotulo}
              </span>
            </div>
            <input
              name="titulo"
              defaultValue={d.titulo}
              required
              aria-label="Título da atividade"
              className="mt-1 w-full truncate rounded-lg border border-transparent bg-transparent px-1 -mx-1 font-display text-[17px] font-bold tracking-tight text-foreground hover:border-border focus:border-navy-3 focus:outline-none"
            />
            {d.cliente ? (
              <Link href={`/admin/clients/${d.cliente.id}`} className="text-sm text-muted hover:text-foreground hover:underline">
                {d.cliente.nome}
              </Link>
            ) : (
              <select name="client_id" required={!!d.publicacao} defaultValue="" className={`${campo} mt-1`} aria-label="Cliente">
                <option value="" disabled={!!d.publicacao}>
                  {d.publicacao ? "Escolher cliente…" : "Sem cliente (tarefa interna)"}
                </option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            )}

            {(d.descricao || d.trechos.length > 0) && (
              <details className="group/det mt-2">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-navy-3 hover:underline">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/det:rotate-180" aria-hidden />
                  {d.trechos.length ? `Ver ${d.origem === "publicacao" ? "texto" : `mensagens (${d.trechos.length})`}` : "Ver detalhes"}
                </summary>
                {d.descricao && <p className="mt-2 text-sm text-foreground/75">{d.descricao}</p>}
                <div className="mt-2 space-y-1.5">
                  {d.trechos.map((t, i) => (
                    <blockquote key={i} className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground/85">
                      <span className="eyebrow block">{t.quem ?? "Cliente"}</span>
                      <span className="block whitespace-pre-line">{t.texto}</span>
                    </blockquote>
                  ))}
                </div>
                {d.publicacao && (
                  <Link href={`/admin/publicacoes?p=${d.publicacao.id}`} className="ui-link mt-2 text-xs">
                    Abrir a publicação <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                )}
              </details>
            )}
            {d.chatJid && (
              <Link href={`/admin/whatsapp?conversa=${encodeURIComponent(d.chatJid)}`} className="ui-link mt-2 inline-flex text-xs">
                <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Abrir conversa no WhatsApp
              </Link>
            )}
          </div>
        </div>

        {/* linha de decisão: responsável, área, tipo, prazo e ações */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/60 px-5 py-3">
          <label className="flex items-center gap-2">
            {escolhido ? <Avatar nome={escolhido.nome} foto={escolhido.foto} tamanho={30} /> : <span className="h-[30px] w-[30px] rounded-full border border-dashed border-border-strong" />}
            <select name="responsavel_id" value={resp} onChange={(e) => setResp(e.target.value)} required className={campo} aria-label="Responsável">
              <option value="">Responsável…</option>
              {ordenados.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                  {daArea(r) ? " ★" : ""}
                </option>
              ))}
            </select>
          </label>
          <select name="area" value={area} onChange={(e) => setArea(e.target.value)} className={campo} aria-label="Área">
            <option value="">Sem área</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select name="tipo" defaultValue={d.tipo ?? "consultoria"} className={campo} aria-label="Tipo">
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <select name="categoria" defaultValue="tarefa" className={campo} aria-label="Na agenda, é" title="Na agenda, é">
            <option value="tarefa">Tarefa</option>
            <option value="prazo">Prazo processual</option>
            <option value="audiencia">Audiência</option>
          </select>
          <input type="date" name="prazo" defaultValue={d.prazo ?? ""} className={campo} aria-label="Dia (prazo ou audiência)" title="Dia (prazo ou audiência)" />
          <input type="time" name="hora" className={`${campo} w-28`} aria-label="Horário (obrigatório na audiência)" title="Horário (obrigatório na audiência)" />
          <div className="ml-auto flex items-center gap-2">
            {state.error && <p className="text-xs text-status-danger">{state.error}</p>}
            <button type="button" onClick={() => mudarStatus("descartada")} disabled={pending} className="ui-btn-secondary" aria-label="Descartar">
              <X className="h-4 w-4" aria-hidden /> Descartar
            </button>
            <button type="submit" disabled={pending} className="ui-btn">
              <CheckCheck className="h-4 w-4" aria-hidden /> {pending ? "Criando…" : d.atividade ? "Distribuir" : "Criar atividade"}
            </button>
          </div>
        </div>
      </form>
    </li>
  );
}
