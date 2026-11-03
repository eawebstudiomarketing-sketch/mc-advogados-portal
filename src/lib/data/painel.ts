import "server-only";
import type { Activity } from "@/lib/data/activities";
import type { Pessoa } from "@/lib/data/escritorio";
import { createAdminClient } from "@/lib/supabase/admin";

// Contas da Visão geral e da Equipe: ranking de quem concluiu, carga de cada
// pessoa e clientes com mais pendências. Tudo a partir da lista de atividades
// que a pessoa logada já pode ver.

export const hojeBahia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const emAberto = (a: Pick<Activity, "status">) => a.status === "aberta" || a.status === "em_andamento";

export type LinhaRanking = { responsavelId: string; nome: string; concluidas: number; rotina: number; pontos: number; abertas: number; atrasadas: number };

type AtividadeRanking = Pick<Activity, "responsavel_id" | "status" | "concluida_em" | "deadline">;

/**
 * Atividades da equipe toda, só os campos do placar (03/11/2026: o ranking ficou
 * visível para todos; quem não vê a equipe só enxerga as próprias atividades,
 * então o placar dos colegas é contado aqui pelo servidor, sem expor o conteúdo).
 */
export async function atividadesDoRanking(): Promise<AtividadeRanking[]> {
  const db = createAdminClient();
  const out: AtividadeRanking[] = [];
  for (let i = 0; ; i += 1000) {
    const { data } = await db.from("activities").select("responsavel_id, status, concluida_em, deadline").is("archived_at", null).range(i, i + 999);
    out.push(...((data ?? []) as AtividadeRanking[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Quem mais concluiu no período (concluida_em dentro dos últimos `dias`). */
/** Pontos = demandas concluídas + itens de rotina feitos no período (1 ponto cada). */
export function ranking(atividades: AtividadeRanking[], pessoas: Pessoa[], dias: number, rotina: Map<string, number> = new Map()): LinhaRanking[] {
  const hoje = hojeBahia();
  const desde = Date.parse(`${somaDias(hoje, -dias + 1)}T00:00:00-03:00`);
  const linhas = new Map<string, LinhaRanking>(
    pessoas.map((p) => [p.id, { responsavelId: p.id, nome: p.nome, concluidas: 0, rotina: rotina.get(p.id) ?? 0, pontos: 0, abertas: 0, atrasadas: 0 }])
  );
  for (const a of atividades) {
    if (!a.responsavel_id) continue;
    const l = linhas.get(a.responsavel_id);
    if (!l) continue;
    if (a.status === "concluida" && a.concluida_em && Date.parse(a.concluida_em) >= desde) l.concluidas++;
    if (emAberto(a)) {
      l.abertas++;
      if (a.deadline && a.deadline < hoje) l.atrasadas++;
    }
  }
  for (const l of linhas.values()) l.pontos = l.concluidas + l.rotina;
  return [...linhas.values()]
    .filter((l) => l.pontos || l.abertas)
    .sort((a, b) => b.pontos - a.pontos || a.atrasadas - b.atrasadas || a.nome.localeCompare(b.nome));
}

export type GrupoPrazo = "atrasadas" | "hoje" | "semana" | "depois" | "sem_prazo";
export const ROTULO_GRUPO: Record<GrupoPrazo, string> = {
  atrasadas: "Atrasadas",
  hoje: "Hoje",
  semana: "Próximos 7 dias",
  depois: "Mais adiante",
  sem_prazo: "Sem prazo",
};

export function grupoDoPrazo(deadline: string | null, hoje = hojeBahia()): GrupoPrazo {
  if (!deadline) return "sem_prazo";
  if (deadline < hoje) return "atrasadas";
  if (deadline === hoje) return "hoje";
  if (deadline <= somaDias(hoje, 7)) return "semana";
  return "depois";
}

export type CargaPessoa = { pessoa: Pessoa; grupos: Record<GrupoPrazo, Activity[]>; total: number };

/** Atividades em aberto de cada pessoa, separadas por prazo. */
export function cargaPorPessoa(atividades: Activity[], pessoas: Pessoa[]): { cargas: CargaPessoa[]; semResponsavel: Activity[] } {
  const hoje = hojeBahia();
  const vazio = (): Record<GrupoPrazo, Activity[]> => ({ atrasadas: [], hoje: [], semana: [], depois: [], sem_prazo: [] });
  const mapa = new Map(pessoas.map((p) => [p.id, { pessoa: p, grupos: vazio(), total: 0 }]));
  const semResponsavel: Activity[] = [];
  for (const a of atividades) {
    if (!emAberto(a)) continue;
    const c = a.responsavel_id ? mapa.get(a.responsavel_id) : undefined;
    if (!c) {
      semResponsavel.push(a);
      continue;
    }
    c.grupos[grupoDoPrazo(a.deadline, hoje)].push(a);
    c.total++;
  }
  return { cargas: [...mapa.values()].sort((a, b) => b.total - a.total || a.pessoa.nome.localeCompare(b.pessoa.nome)), semResponsavel };
}

/** Clientes com mais atividades em aberto (e quantas atrasadas). */
export function clientesComMaisPendencias(atividades: Activity[], limite = 8) {
  const hoje = hojeBahia();
  const mapa = new Map<string, { id: string; nome: string; abertas: number; atrasadas: number }>();
  for (const a of atividades) {
    if (!emAberto(a) || !a.client_id) continue;
    const c = mapa.get(a.client_id) ?? { id: a.client_id, nome: a.clients?.name ?? "Cliente", abertas: 0, atrasadas: 0 };
    c.abertas++;
    if (a.deadline && a.deadline < hoje) c.atrasadas++;
    mapa.set(a.client_id, c);
  }
  return [...mapa.values()].sort((a, b) => b.abertas - a.abertas || b.atrasadas - a.atrasadas).slice(0, limite);
}

const itemDemanda = (a: Activity) => ({
  id: a.id,
  titulo: a.title,
  cliente: a.clients?.name ?? null,
  prazo: a.deadline,
  status: a.status,
  area: a.area,
});

/** Formato leve (só o que a tela mostra) para mandar a um componente do navegador. */
export function serializarCargas(atividades: Activity[], pessoas: Pessoa[]) {
  const { cargas, semResponsavel } = cargaPorPessoa(atividades, pessoas);
  return {
    cargas: cargas.map((c) => ({
      id: c.pessoa.id,
      nome: c.pessoa.nome,
      areas: c.pessoa.areas,
      foto: c.pessoa.foto,
      total: c.total,
      grupos: (Object.keys(ROTULO_GRUPO) as GrupoPrazo[]).map((g) => ({ chave: g, rotulo: ROTULO_GRUPO[g], itens: c.grupos[g].map(itemDemanda) })),
    })),
    semResponsavel: semResponsavel.map(itemDemanda),
  };
}
