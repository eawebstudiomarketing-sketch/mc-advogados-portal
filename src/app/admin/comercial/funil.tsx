"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarClock, MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { COR_ETAPA, MOTIVOS_PERDA, linkZap, primeiroNome, telefoneBonito, type Etapa } from "@/lib/crm/tipos";
import { contatoLeadAction, moverLeadAction } from "./actions";

// Funil (Kanban) do CRM: arrasta o cartão entre as colunas. No celular (sem
// arrastar) cada cartão tem o seletor "Mover para…".

export type CartaoLead = {
  id: string;
  nome: string | null;
  empresa: string | null;
  telefone: string | null;
  etapa_id: string | null;
  responsavel: string | null;
  formulario: string | null;
  origem: string | null;
  created_at: string;
  proximo_contato: string | null;
  contatado: boolean;
  valor: number | null;
};

const quando = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  const d = Math.round(min / 1440);
  return d === 1 ? "ontem" : `há ${d} dias`;
};
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Pendente = { lead: CartaoLead; etapa: Etapa } | null;

export function Funil({ etapas, leads, equipe }: { etapas: Etapa[]; leads: CartaoLead[]; equipe: { id: string; nome: string }[] }) {
  const [lista, mover] = useOptimistic(leads, (atual, m: { id: string; etapa: string }) => atual.map((l) => (l.id === m.id ? { ...l, etapa_id: m.etapa } : l)));
  const [, iniciar] = useTransition();
  const [sobre, setSobre] = useState<string | null>(null);
  const [pendente, setPendente] = useState<Pendente>(null);
  const nomeDe = (id: string | null) => equipe.find((p) => p.id === id)?.nome ?? null;

  const aplicar = (lead: CartaoLead, etapa: Etapa, extra: { motivo?: string | null; valor?: number | null } = {}) => {
    iniciar(async () => {
      mover({ id: lead.id, etapa: etapa.id });
      const r = await moverLeadAction(lead.id, etapa.id, extra);
      if (!r.ok) toast.error(r.erro);
      else toast.success(`${lead.nome ?? "Lead"} → ${etapa.nome}`);
    });
  };
  const pedirMover = (lead: CartaoLead, etapaId: string) => {
    const etapa = etapas.find((e) => e.id === etapaId);
    if (!etapa || lead.etapa_id === etapaId) return;
    if (etapa.tipo === "perdido" || etapa.tipo === "ganho") setPendente({ lead, etapa });
    else aplicar(lead, etapa);
  };

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="flex min-w-max gap-3">
          {etapas.map((e) => {
            const daqui = lista.filter((l) => l.etapa_id === e.id);
            const soma = daqui.reduce((s, l) => s + (l.valor ?? 0), 0);
            const cor = COR_ETAPA[e.cor] ?? COR_ETAPA.navy;
            return (
              <section
                key={e.id}
                aria-label={e.nome}
                onDragOver={(ev) => {
                  ev.preventDefault();
                  setSobre(e.id);
                }}
                onDragLeave={() => setSobre((s) => (s === e.id ? null : s))}
                onDrop={(ev) => {
                  ev.preventDefault();
                  setSobre(null);
                  const lead = lista.find((l) => l.id === ev.dataTransfer.getData("text/lead"));
                  if (lead) pedirMover(lead, e.id);
                }}
                className={`flex w-[280px] shrink-0 flex-col rounded-2xl border bg-surface-2 p-2.5 transition-colors ${sobre === e.id ? "border-navy-3 bg-hover" : "border-border"}`}
              >
                <header className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
                  <span className={`h-2 w-2 rounded-full ${cor.ponto}`} aria-hidden />
                  <h2 className="flex-1 truncate text-sm font-semibold text-foreground">{e.nome}</h2>
                  <span className="rounded bg-surface px-1.5 text-xs font-semibold text-muted tabular-nums">{daqui.length}</span>
                </header>
                {soma > 0 && <p className="-mt-1.5 mb-2 px-1.5 text-xs text-muted">{brl(soma)}</p>}
                <ul className="flex min-h-24 flex-col gap-2">
                  {daqui.map((l) => {
                    const atrasado = l.proximo_contato && Date.parse(l.proximo_contato) < Date.now();
                    const resp = nomeDe(l.responsavel);
                    return (
                      <li
                        key={l.id}
                        draggable
                        onDragStart={(ev) => {
                          ev.dataTransfer.setData("text/lead", l.id);
                          ev.dataTransfer.effectAllowed = "move";
                        }}
                        className="group rounded-xl border border-border bg-surface p-3 shadow-sm transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-md active:cursor-grabbing"
                      >
                        <div className="flex items-start gap-2">
                          <Link href={`/admin/comercial/${l.id}`} className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground group-hover:underline">{l.nome ?? telefoneBonito(l.telefone) ?? "Sem nome"}</p>
                            {l.empresa && <p className="truncate text-xs text-muted">{l.empresa}</p>}
                          </Link>
                          {resp && <Avatar nome={resp} tamanho={24} />}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {l.formulario && <span className="max-w-full truncate rounded bg-surface-2 px-1.5 py-0.5 text-muted">{l.formulario}</span>}
                          {l.origem && <span className="rounded bg-status-info-bg px-1.5 py-0.5 text-status-info">{l.origem}</span>}
                          {!l.contatado && e.tipo === "aberta" && <span className="rounded bg-status-pending-bg px-1.5 py-0.5 font-semibold text-status-pending">sem contato</span>}
                          {l.valor ? <span className="rounded bg-status-success-bg px-1.5 py-0.5 text-status-success">{brl(l.valor)}</span> : null}
                        </div>
                        {l.proximo_contato && (
                          <p className={`mt-2 flex items-center gap-1 text-xs ${atrasado ? "font-semibold text-status-danger" : "text-muted"}`}>
                            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> {atrasado ? "Retorno atrasado: " : "Retornar "}
                            {dataHora(l.proximo_contato)}
                          </p>
                        )}
                        <div className="mt-2.5 flex items-center gap-2">
                          <span className="flex-1 text-[11px] text-muted">{quando(l.created_at)}</span>
                          {l.telefone && (
                            <a
                              href={linkZap(l.telefone, `Olá, ${primeiroNome(l.nome) || "tudo bem"}! Aqui é do escritório MC Advogados. Recebemos suas respostas e vamos te ajudar.`)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => void contatoLeadAction(l.id, "whatsapp")}
                              className="inline-flex h-7 items-center gap-1 rounded-md bg-zap-bg px-2 text-[11px] font-semibold text-zap-ink"
                              aria-label={`Chamar ${l.nome ?? ""} no WhatsApp`}
                            >
                              <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Zap
                            </a>
                          )}
                          <select aria-label="Mover para" value={l.etapa_id ?? ""} onChange={(ev) => pedirMover(l, ev.target.value)} className="h-7 max-w-[7.5rem] rounded-md border border-border bg-surface px-1 text-[11px] text-foreground">
                            {etapas.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.nome}
                              </option>
                            ))}
                          </select>
                        </div>
                      </li>
                    );
                  })}
                  {daqui.length === 0 && <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted">Arraste um lead para cá</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      {pendente && <ConfirmarFechamento pendente={pendente} onCancelar={() => setPendente(null)} onConfirmar={(extra) => (aplicar(pendente.lead, pendente.etapa, extra), setPendente(null))} />}
    </>
  );
}

function ConfirmarFechamento({ pendente, onCancelar, onConfirmar }: { pendente: NonNullable<Pendente>; onCancelar: () => void; onConfirmar: (extra: { motivo?: string | null; valor?: number | null }) => void }) {
  const perdido = pendente.etapa.tipo === "perdido";
  const [motivo, setMotivo] = useState(MOTIVOS_PERDA[0]);
  const [outro, setOutro] = useState("");
  const [valor, setValor] = useState(pendente.lead.valor ? String(pendente.lead.valor) : "");
  return (
    <div role="dialog" aria-modal aria-labelledby="fechar-titulo" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCancelar}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (perdido) onConfirmar({ motivo: motivo === "Outro" ? outro.trim() || "Outro" : motivo });
          else {
            const n = Number(valor.replace(/\./g, "").replace(",", "."));
            onConfirmar(valor.trim() && Number.isFinite(n) ? { valor: n } : {});
          }
        }}
        className="ui-card w-full max-w-sm space-y-4 p-5"
      >
        <h2 id="fechar-titulo" className="section-title">
          {perdido ? `Por que ${pendente.lead.nome ?? "o lead"} foi perdido?` : `${pendente.lead.nome ?? "Lead"} fechou! 🎉`}
        </h2>
        {perdido ? (
          <div className="space-y-2">
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="ui-input" aria-label="Motivo">
              {MOTIVOS_PERDA.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            {motivo === "Outro" && <input value={outro} onChange={(e) => setOutro(e.target.value)} className="ui-input" placeholder="Qual foi o motivo?" autoFocus />}
          </div>
        ) : (
          <label className="block space-y-1.5">
            <span className="ui-label">Valor fechado (R$, opcional)</span>
            <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="ui-input" placeholder="Ex.: 2.500" autoFocus />
            <span className="block text-xs text-muted">Vai para a Meta e o Google como venda: os anúncios aprendem a trazer quem fecha.</span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="ui-btn-secondary px-4 py-2 text-sm">
            Cancelar
          </button>
          <button type="submit" className="ui-btn px-4 py-2 text-sm">
            {perdido ? "Marcar como perdido" : "Marcar como fechado"}
          </button>
        </div>
      </form>
    </div>
  );
}
