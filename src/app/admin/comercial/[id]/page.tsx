import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, UserCheck } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { conversaDoLead, equipeComercial, eventosDoLead, formularioPorId, lerLead, listarEtapas } from "@/lib/crm/dados";
import { linkZap, primeiroNome, telefoneBonito } from "@/lib/crm/tipos";
import { excluirLeadAction } from "../actions";
import { DadosDoLead } from "./dados-do-lead";
import { EtapasDoLead } from "./etapas-do-lead";
import { Historico } from "./historico";
import { BotaoZap, VirarCliente } from "./botoes";

// Ficha do lead (CRM, 06/11/2026): etapa, dados, respostas do formulário,
// de onde veio (anúncio/UTM), histórico com anotações e a conversa do Zap.

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" });

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { permissoes } = await exigirPermissao("comercial");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const lead = await lerLead(id);
  if (!lead) notFound();
  const [etapas, equipe, eventos, form, conversa] = await Promise.all([listarEtapas(), equipeComercial(), eventosDoLead(id), lead.formulario_id ? formularioPorId(lead.formulario_id) : null, conversaDoLead(lead.telefone, lead.chat_jid)]);
  const nomes = new Map(equipe.map((p) => [p.id, p.nome]));
  const origem = Object.entries({ ...lead.utm }).filter(([, v]) => v);
  const r = lead.rastreio ?? {};
  const msgZap = `Olá, ${primeiroNome(lead.nome) || "tudo bem"}! Aqui é do escritório MC Advogados. ${form ? "Recebemos suas respostas e vamos te ajudar." : ""}`.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/comercial", label: "Funil" }}
        title={lead.nome ?? (telefoneBonito(lead.telefone) || "Lead sem nome")}
        description={
          <>
            {lead.empresa ? `${lead.empresa} · ` : ""}
            {form ? `Formulário ${form.nome}` : lead.origem === "manual" ? "Cadastro manual" : `Origem: ${lead.origem}`} · chegou em {dataHora(lead.created_at)}
          </>
        }
        actions={
          <>
            {lead.telefone && <BotaoZap leadId={lead.id} href={linkZap(lead.telefone, msgZap)} />}
            {lead.client_id ? (
              <Link href={`/admin/clients/${lead.client_id}`} className="ui-btn-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
                <UserCheck className="h-4 w-4" aria-hidden /> Ver cliente
              </Link>
            ) : (
              permissoes.clientes && <VirarCliente leadId={lead.id} />
            )}
            {permissoes.excluir && (
              <ConfirmSubmitButton
                action={async () => {
                  "use server";
                  await excluirLeadAction(id);
                }}
                hiddenFields={{}}
                confirmMessage="Excluir este lead e todo o histórico dele?"
                label="Excluir lead"
                icon="trash"
              />
            )}
          </>
        }
      />

      <EtapasDoLead leadId={lead.id} etapaId={lead.etapa_id} etapas={etapas} valor={lead.valor} motivo={lead.motivo_perda} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <DadosDoLead lead={lead} equipe={equipe} />

          {lead.respostas.length > 0 && (
            <section className="ui-card p-5" aria-labelledby="respostas">
              <h2 id="respostas" className="section-title mb-3">
                Respostas do formulário
              </h2>
              <dl className="space-y-3">
                {lead.respostas.map((x, i) => (
                  <div key={i}>
                    <dt className="text-xs text-muted">{x.pergunta}</dt>
                    <dd className="text-sm whitespace-pre-line text-foreground">{x.resposta}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="ui-card p-5" aria-labelledby="origem">
            <h2 id="origem" className="section-title mb-3">
              De onde veio
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">Canal</dt>
              <dd className="text-foreground">{r.fbclid ? "Anúncio da Meta (Facebook/Instagram)" : r.gclid ? "Anúncio do Google" : lead.utm?.source ? lead.utm.source : form ? "Link direto do formulário" : lead.origem}</dd>
              {origem.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{{ source: "Origem", medium: "Mídia", campaign: "Campanha", content: "Anúncio", term: "Termo" }[k] ?? k}</dt>
                  <dd className="break-words text-foreground">{v}</dd>
                </div>
              ))}
              {r.pagina && (
                <>
                  <dt className="text-muted">Página</dt>
                  <dd className="break-all text-foreground">{r.pagina.replace(/^https?:\/\//, "").split("?")[0]}</dd>
                </>
              )}
              {r.referrer && (
                <>
                  <dt className="text-muted">Veio de</dt>
                  <dd className="break-all text-foreground">{r.referrer.replace(/^https?:\/\//, "").split("/")[0]}</dd>
                </>
              )}
            </dl>
          </section>
        </div>

        <div className="space-y-6">
          {conversa && (
            <section className="ui-card p-5" aria-labelledby="conversa">
              <h2 id="conversa" className="section-title mb-3 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-zap-ink" aria-hidden /> Conversa no WhatsApp do escritório
              </h2>
              <ol className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {conversa.mensagens.map((m) => (
                  <li key={m.id} className={`flex ${m.from_me ? "justify-end" : ""}`}>
                    <p className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-line ${m.from_me ? "bg-zap-bg text-zap-ink" : "bg-surface-2 text-foreground"}`}>
                      {m.texto || `[${m.tipo}]`}
                      <span className="mt-1 block text-[10px] opacity-60">{dataHora(m.created_at)}</span>
                    </p>
                  </li>
                ))}
              </ol>
              <Link href="/admin/whatsapp" className="ui-link mt-3 inline-block text-sm">
                Abrir o WhatsApp do portal
              </Link>
            </section>
          )}
          <Historico leadId={lead.id} eventos={eventos.map((e) => ({ ...e, autorNome: e.autor ? (nomes.get(e.autor) ?? null) : null }))} />
        </div>
      </div>
    </div>
  );
}
