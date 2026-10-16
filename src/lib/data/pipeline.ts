import "server-only";
import { createClient } from "@/lib/supabase/server";
import { handoffProgresso, type HandoffAnswers } from "@/lib/handoff-schema";

// Pipeline do cliente: em que ponto da operação cada cliente está. Ninguém
// arrasta cartão: a etapa sai do que já aconteceu no portal (ficha,
// onboarding, demandas, atividades). Vale a etapa mais adiantada alcançada.

export const ETAPAS = [
  { id: "ficha_incompleta", rotulo: "Ficha incompleta", dica: "Ficha de handoff com menos de 80% preenchido" },
  { id: "ficha_completa", rotulo: "Ficha completa", dica: "Pronto para gerar o onboarding" },
  { id: "onboarding_gerado", rotulo: "Onboarding gerado", dica: "Perguntas prontas, esperando respostas" },
  { id: "onboarding_respondido", rotulo: "Onboarding respondido", dica: "Respostas salvas, falta gerar demandas" },
  { id: "demandas_geradas", rotulo: "Demandas geradas", dica: "Rascunhos de demandas esperando aprovação" },
  { id: "em_execucao", rotulo: "Em execução", dica: "Demandas aprovadas viraram atividades" },
] as const;
export type EtapaId = (typeof ETAPAS)[number]["id"];

export type CartaoPipeline = {
  id: string;
  nome: string;
  etapa: EtapaId;
  fichaPct: number;
  rascunhos: number;
  abertas: number;
  atrasadas: number;
  desde: string | null; // quando entrou na etapa (aproximado)
};

const CORTE_FICHA = 0.8;

export async function pipelineDosClientes(): Promise<CartaoPipeline[]> {
  const supabase = await createClient();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const [{ data: clientes }, { data: onbs }, { data: drafts }, { data: ativs }] = await Promise.all([
    supabase.from("clients").select("id, name, handoff, handoff_updated_at, created_at").is("archived_at", null).eq("active", true).order("name"),
    supabase.from("onboardings").select("client_id, answers, created_at, updated_at").order("created_at", { ascending: false }),
    supabase.from("onboarding_demand_drafts").select("client_id, status, created_at, updated_at"),
    supabase.from("activities").select("client_id, status, deadline").is("archived_at", null).in("status", ["aberta", "em_andamento"]),
  ]);

  return (clientes ?? []).map((c) => {
    const { feitos, total } = handoffProgresso((c.handoff ?? null) as HandoffAnswers | null);
    const fichaPct = total ? feitos / total : 0;
    const onb = (onbs ?? []).find((o) => o.client_id === c.id);
    const respondido = !!onb && Object.values((onb.answers ?? {}) as Record<string, string>).some((v) => typeof v === "string" && v.trim());
    const ds = (drafts ?? []).filter((d) => d.client_id === c.id);
    const aprovadas = ds.filter((d) => d.status === "aprovada");
    const rascunhos = ds.filter((d) => d.status === "rascunho").length;
    const abertas = (ativs ?? []).filter((a) => a.client_id === c.id);

    let etapa: EtapaId = "ficha_incompleta";
    let desde: string | null = c.created_at;
    if (fichaPct >= CORTE_FICHA) [etapa, desde] = ["ficha_completa", c.handoff_updated_at];
    if (onb) [etapa, desde] = ["onboarding_gerado", onb.created_at];
    if (respondido) [etapa, desde] = ["onboarding_respondido", onb!.updated_at];
    if (ds.length) [etapa, desde] = ["demandas_geradas", ds.map((d) => d.created_at).sort()[0]];
    if (aprovadas.length) [etapa, desde] = ["em_execucao", aprovadas.map((d) => d.updated_at).sort().at(-1) ?? null];

    return {
      id: c.id,
      nome: c.name,
      etapa,
      fichaPct: Math.round(fichaPct * 100),
      rascunhos,
      abertas: abertas.length,
      atrasadas: abertas.filter((a) => a.deadline && a.deadline < hoje).length,
      desde,
    };
  });
}
