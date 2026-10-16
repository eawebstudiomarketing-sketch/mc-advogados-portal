import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, XCircle, MessageCircle } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listClients } from "@/lib/data/clients";
import { getEscritorioConfig, listPessoas } from "@/lib/data/escritorio";
import { destinosDosClientes, enviosDe } from "@/lib/zap/fila";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { CompromissoForm } from "../../compromisso-form";
import { excluirCompromissoAction } from "../../actions";

const bahia = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", ...o });
const ESTADO: Record<string, { rotulo: string; icone: typeof Clock3; cor: string }> = {
  pendente: { rotulo: "Agendado", icone: Clock3, cor: "text-status-info" },
  executando: { rotulo: "Enviando", icone: Clock3, cor: "text-status-pending" },
  concluido: { rotulo: "Enviado", icone: CheckCircle2, cor: "text-status-success" },
  erro: { rotulo: "Falhou", icone: XCircle, cor: "text-status-danger" },
  cancelado: { rotulo: "Cancelado", icone: XCircle, cor: "text-muted" },
};

export default async function CompromissoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("agenda");
  const { id } = await params;
  const supabase = await createClient();
  const { data: c } = await supabase.from("compromissos").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [clientes, pessoas, config, envios] = await Promise.all([listClients(), listPessoas(), getEscritorioConfig(), enviosDe(`compromisso:${id}:`)]);
  const destinos = await destinosDosClientes(clientes.map((x) => x.id));
  const visiveis = envios.filter((e) => e.status !== "cancelado" || e.erro);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">{c.titulo}</h1>
          <p className="text-sm text-muted">
            {bahia(c.inicio, { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })}
            {c.fim ? ` até ${bahia(c.fim, { hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
        </div>
        <ConfirmSubmitButton
          action={excluirCompromissoAction}
          hiddenFields={{ id }}
          confirmMessage="Excluir este compromisso? Os lembretes que ainda não saíram são cancelados."
          label="Excluir"
          icon="trash"
        />
      </div>

      {visiveis.length > 0 && (
        <section className="ui-card mb-5 max-w-2xl p-4">
          <h2 className="section-title flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[#1f7a43]" aria-hidden /> Lembretes para o cliente
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {visiveis.map((e) => {
              const s = ESTADO[e.status] ?? ESTADO.pendente;
              const Icone = s.icone;
              return (
                <li key={e.id} className="flex items-center gap-2">
                  <Icone className={`h-4 w-4 ${s.cor}`} aria-hidden />
                  <span className="text-foreground">{e.origem_ref?.endsWith(":24h") ? "24 horas antes" : "1 hora antes"}</span>
                  <span className="text-xs text-muted">
                    {s.rotulo}
                    {e.agendado_para ? ` · ${bahia(e.agendado_para, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                    {e.erro ? ` · ${e.erro}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">Saem pelo Agente do WhatsApp; se ele estiver desligado na hora, saem quando ligar.</p>
        </section>
      )}

      <CompromissoForm
        inicial={{
          id: c.id,
          titulo: c.titulo,
          tipo: c.tipo,
          dia: bahia(c.inicio, { year: "numeric", month: "2-digit", day: "2-digit" }).split("/").reverse().join("-"),
          hora: bahia(c.inicio, { hour: "2-digit", minute: "2-digit" }),
          horaFim: c.fim ? bahia(c.fim, { hour: "2-digit", minute: "2-digit" }) : undefined,
          local: c.local,
          descricao: c.descricao,
          clientId: c.client_id,
          participantes: c.participantes,
          lembrarCliente: c.lembrar_cliente,
        }}
        clientes={clientes.map((x) => ({ id: x.id, name: x.name }))}
        pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome }))}
        destinos={destinos}
        lembretesAtivos={config.lembretes_ativos}
      />
    </div>
  );
}
