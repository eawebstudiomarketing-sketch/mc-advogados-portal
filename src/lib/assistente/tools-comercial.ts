import "server-only";
import { equipeComercial, listarEtapas, listarFormularios, listarLeads, registrarEvento } from "@/lib/crm/dados";
import { moverLead } from "@/lib/crm/leads";
import { telefoneBonito } from "@/lib/crm/tipos";
import type { ToolDef } from "./tools";

// CRM / Comercial (06/11/2026): o Assistente consulta o funil, acha um lead,
// move de etapa e anota. Permissão "comercial".

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const sem = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

async function acharLead(termo: unknown) {
  const t = String(termo ?? "").trim();
  if (!t) throw new Error("Diga o nome, a empresa ou o WhatsApp do lead.");
  const achados = await listarLeads({ busca: t });
  if (!achados.length) throw new Error(`Não achei lead com "${t}".`);
  return achados[0];
}

export const TOOLS_COMERCIAL: ToolDef[] = [
  {
    name: "leads_crm",
    kind: "read",
    perm: ["comercial"],
    label: "Consultou o funil de leads",
    description:
      "Leads do CRM (Comercial): quantos chegaram no período, quantos em cada etapa do funil, sem contato, fechados e perdidos, e a lista dos mais recentes (nome, empresa, formulário, etapa, responsável). Use para 'quantos leads chegaram hoje', 'leads sem contato', 'como está o funil'.",
    parameters: obj({ dias: { type: "number", description: "período em dias (padrão 7)" }, busca: { type: "string", description: "nome, empresa ou WhatsApp (opcional)" } }),
    run: async (a) => {
      const dias = Math.min(365, Math.max(1, Number(a.dias) || 7));
      const [leads, etapas, forms, equipe] = await Promise.all([
        listarLeads({ desde: new Date(Date.now() - dias * 86_400_000).toISOString(), busca: a.busca ? String(a.busca) : undefined }),
        listarEtapas(),
        listarFormularios(),
        equipeComercial(),
      ]);
      const nomeEtapa = (id: string | null) => etapas.find((e) => e.id === id)?.nome ?? "—";
      return {
        tela: "/admin/comercial",
        periodo_dias: dias,
        total: leads.length,
        sem_contato: leads.filter((l) => !l.primeiro_contato_em && etapas.find((e) => e.id === l.etapa_id)?.tipo === "aberta").length,
        por_etapa: etapas.map((e) => ({ etapa: e.nome, leads: leads.filter((l) => l.etapa_id === e.id).length })),
        recentes: leads.slice(0, 20).map((l) => ({
          nome: l.nome,
          empresa: l.empresa,
          whatsapp: telefoneBonito(l.telefone),
          formulario: forms.find((f) => f.id === l.formulario_id)?.nome ?? l.origem,
          etapa: nomeEtapa(l.etapa_id),
          responsavel: equipe.find((p) => p.id === l.responsavel)?.nome ?? null,
          chegou: new Date(l.created_at).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" }),
          link: `/admin/comercial/${l.id}`,
        })),
      };
    },
  },
  {
    name: "mover_lead",
    kind: "write",
    perm: ["comercial"],
    label: "Moveu lead no funil",
    description: "Muda a etapa de um lead no funil do CRM (ex.: 'move o João para Proposta', 'marca a Maria como perdida porque achou caro', 'fechou com a empresa X por 2500').",
    parameters: obj(
      {
        lead: { type: "string", description: "nome, empresa ou WhatsApp" },
        etapa: { type: "string", description: "nome da etapa (Novo, Em contato, Reunião marcada, Proposta enviada, Fechado, Perdido)" },
        motivo: { type: "string", description: "motivo, se for Perdido" },
        valor: { type: "number", description: "valor fechado em R$, se for Fechado" },
      },
      ["lead", "etapa"],
    ),
    resumo: (a) => `Mover ${a.lead} para ${a.etapa}`,
    run: async (a, ctx) => {
      const lead = await acharLead(a.lead);
      const etapas = await listarEtapas();
      const alvo = etapas.find((e) => sem(e.nome) === sem(a.etapa)) ?? etapas.find((e) => sem(e.nome).includes(sem(a.etapa)) || sem(a.etapa).includes(sem(e.nome)));
      if (!alvo) throw new Error(`Etapa não encontrada. Etapas: ${etapas.map((e) => e.nome).join(", ")}.`);
      const r = await moverLead(lead.id, alvo.id, ctx.profileId, { motivo: a.motivo ? String(a.motivo) : null, ...(Number(a.valor) > 0 ? { valor: Number(a.valor) } : {}) });
      if (!r.ok) throw new Error(r.erro);
      return { lead: lead.nome ?? lead.empresa, etapa: alvo.nome, link: `/admin/comercial/${lead.id}` };
    },
  },
  {
    name: "anotar_lead",
    kind: "write",
    perm: ["comercial"],
    label: "Anotou no lead",
    description: "Registra uma anotação no histórico de um lead do CRM (ligação, combinado, objeção).",
    parameters: obj({ lead: { type: "string" }, texto: { type: "string" } }, ["lead", "texto"]),
    resumo: (a) => `Anotar em ${a.lead}: ${String(a.texto ?? "").slice(0, 80)}`,
    run: async (a, ctx) => {
      const lead = await acharLead(a.lead);
      const t = String(a.texto ?? "").trim();
      if (!t) throw new Error("Diga o que anotar.");
      await registrarEvento(lead.id, "nota", t.slice(0, 4000), {}, ctx.profileId);
      return { lead: lead.nome ?? lead.empresa, anotado: true, link: `/admin/comercial/${lead.id}` };
    },
  },
];
