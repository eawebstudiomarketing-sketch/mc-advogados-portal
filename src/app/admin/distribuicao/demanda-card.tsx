"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MessageCircle, Globe, CheckCheck, X, RotateCcw, ArrowRight } from "lucide-react";
import { ACTIVITY_TYPE_LABEL, ACTIVITY_TYPES } from "@/lib/activity-type";
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
  trechos: { texto: string; quem?: string | null; em?: string | null }[];
  criadoEm: string;
};

const ORIGEM: Record<string, { rotulo: string; icone: typeof Globe; cor: string }> = {
  whatsapp: { rotulo: "WhatsApp", icone: MessageCircle, cor: "bg-[#e7f6ec] text-[#1f7a43]" },
  portal_cliente: { rotulo: "Portal do cliente", icone: Globe, cor: "bg-status-info-bg text-status-info" },
  email: { rotulo: "E-mail", icone: Globe, cor: "bg-surface-2 text-muted" },
  outro: { rotulo: "Outro", icone: Globe, cor: "bg-surface-2 text-muted" },
};
const PRIORIDADE: Record<string, string> = { alta: "text-status-danger", media: "text-status-pending", baixa: "text-muted" };
const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function DemandaCard({
  d,
  areas,
  responsaveis,
  selecionavel,
}: {
  d: DemandaSerial;
  areas: string[];
  responsaveis: { id: string; nome: string; areas: string[] }[];
  selecionavel: boolean;
}) {
  const [state, action, pending] = useActionState<DistribuirState, FormData>(distribuirAction, { error: null });
  const [area, setArea] = useState(d.area ?? "");
  const [resp, setResp] = useState(d.responsavelSugerido ?? "");
  const o = ORIGEM[d.origem] ?? ORIGEM.outro;
  const Icone = o.icone;
  const daArea = (r: { areas: string[] }) => !!area && r.areas.some((a) => a.toLowerCase() === area.toLowerCase());
  const ordenados = [...responsaveis].sort((a, b) => Number(daArea(b)) - Number(daArea(a)) || a.nome.localeCompare(b.nome));

  if (state.ok) {
    return (
      <li className="ui-card flex items-center gap-2 px-4 py-3 text-sm text-status-success">
        <CheckCheck className="h-4 w-4" aria-hidden /> “{d.titulo}” virou atividade.
      </li>
    );
  }

  return (
    <li className="ui-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 text-xs">
        {selecionavel && d.status === "pendente" && (
          <input type="checkbox" name="id" value={d.id} form="distribuicao-lote" aria-label={`Selecionar ${d.titulo}`} className="h-4 w-4 accent-[var(--navy)]" />
        )}
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${o.cor}`}>
          <Icone className="h-3.5 w-3.5" aria-hidden /> {o.rotulo}
        </span>
        {d.cliente && (
          <Link href={`/admin/clients/${d.cliente.id}`} className="font-medium text-foreground hover:underline">
            {d.cliente.nome}
          </Link>
        )}
        <span className="text-muted">· {quando(d.criadoEm)}</span>
        <span className={`ml-auto font-medium ${PRIORIDADE[d.prioridade] ?? ""}`}>Prioridade {d.prioridade === "media" ? "média" : d.prioridade}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{d.titulo}</p>
          {d.descricao && <p className="mt-1 text-sm whitespace-pre-line text-foreground/80">{d.descricao}</p>}
          {d.trechos.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Mensagens</p>
              {d.trechos.map((t, i) => (
                <blockquote key={i} className="rounded-lg border-l-2 border-[#25d366] bg-surface-2 px-3 py-1.5 text-sm text-foreground/85">
                  <span className="text-xs font-medium text-muted">
                    {t.quem ?? "Cliente"}
                    {t.em ? ` · ${quando(t.em)}` : ""}
                  </span>
                  <span className="block whitespace-pre-line">{t.texto}</span>
                </blockquote>
              ))}
            </div>
          )}
          {d.atividade && (
            <Link href={`/admin/activities/${d.atividade.id}`} className="ui-link mt-3 text-xs">
              Atividade: {d.atividade.titulo} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>

        {d.status === "pendente" ? (
          <form action={action} className="space-y-2 rounded-xl bg-surface-2/60 p-3">
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="descricao" value={[d.descricao, ...d.trechos.map((t) => `${t.quem ?? "Cliente"}: ${t.texto}`)].filter(Boolean).join("\n\n")} />
            <label className="block">
              <span className="text-[11px] font-medium text-muted">Título da atividade</span>
              <input name="titulo" defaultValue={d.titulo} required className="ui-input py-1.5 text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] font-medium text-muted">Área</span>
                <select name="area" value={area} onChange={(e) => setArea(e.target.value)} className="ui-input py-1.5 text-sm">
                  <option value="">Sem área</option>
                  {areas.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-muted">Tipo</span>
                <select name="tipo" defaultValue={d.tipo ?? "consultoria"} className="ui-input py-1.5 text-sm">
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACTIVITY_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-[11px] font-medium text-muted">
                Responsável{d.responsavelSugerido && resp === d.responsavelSugerido ? " (sugerido pela área)" : ""}
              </span>
              <select name="responsavel_id" value={resp} onChange={(e) => setResp(e.target.value)} required className="ui-input py-1.5 text-sm">
                <option value="">Escolha…</option>
                {ordenados.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                    {daArea(r) ? ` · ${area}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-muted">Prazo</span>
              <input type="date" name="prazo" defaultValue={d.prazo ?? ""} className="ui-input py-1.5 text-sm" />
            </label>
            {state.error && <p className="text-xs text-status-danger">{state.error}</p>}
            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={pending} className="ui-btn flex-1 px-3 py-1.5 text-xs">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden /> {pending ? "Salvando..." : d.atividade ? "Distribuir" : "Criar atividade"}
              </button>
              <button type="submit" formAction={mudarStatusDistribuicaoAction} name="status" value="descartada" className="ui-btn-secondary px-3 py-1.5 text-xs">
                <X className="h-3.5 w-3.5" aria-hidden /> Descartar
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-end">
            {d.status === "descartada" && (
              <form action={mudarStatusDistribuicaoAction}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="status" value="pendente" />
                <button type="submit" className="ui-btn-secondary px-3 py-1.5 text-xs">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Voltar para pendentes
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
