import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listActivities, type Activity } from "@/lib/data/activities";

// Dados do portal do cliente: as atividades dele com quem está cuidando
// (nome + foto) e, nos pedidos que ele mesmo abriu, em que etapa estão.

export type Etapa = "enviado" | "recebido" | "andamento" | "concluido";
export const ETAPAS: { chave: Etapa; rotulo: string }[] = [
  { chave: "enviado", rotulo: "Enviado" },
  { chave: "recebido", rotulo: "Recebido" },
  { chave: "andamento", rotulo: "Em andamento" },
  { chave: "concluido", rotulo: "Concluído" },
];

export type AtividadeCliente = Activity & {
  pessoa: { nome: string; foto: string | null } | null;
  doCliente: boolean; // pedido aberto por ele no portal
  etapa: Etapa;
};

function etapaDe(a: Activity): Etapa {
  if (a.status === "concluida") return "concluido";
  if (a.status === "em_andamento") return "andamento";
  return a.responsavel_id ? "recebido" : "enviado";
}

export async function atividadesDoPortal(profile: { id: string; client_id: string | null }): Promise<AtividadeCliente[]> {
  const lista = (await listActivities({ clientId: profile.client_id! })).filter((a) => a.status !== "cancelada");

  // o cliente não lê a tabela de responsáveis (regras do banco); aqui vai só nome e foto
  const ids = [...new Set(lista.map((a) => a.responsavel_id).filter((x): x is string => !!x))];
  const pessoas = new Map<string, { nome: string; foto: string | null }>();
  if (ids.length) {
    const { data } = await createAdminClient().from("responsaveis").select("id, nome, foto_url").in("id", ids);
    for (const r of data ?? []) pessoas.set(r.id, { nome: r.nome, foto: r.foto_url });
  }

  return lista.map((a) => ({
    ...a,
    pessoa: a.responsavel_id ? (pessoas.get(a.responsavel_id) ?? null) : null,
    doCliente: a.responsible_id === profile.id,
    etapa: etapaDe(a),
  }));
}

/** "vence hoje", "vence em 3 dias", "venceu há 2 dias" (fuso da Bahia). */
export function prazoRelativo(deadline: string | null): { texto: string; atrasado: boolean } | null {
  if (!deadline) return null;
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const dias = Math.round((Date.parse(deadline) - Date.parse(hoje)) / 86_400_000);
  if (dias === 0) return { texto: "vence hoje", atrasado: false };
  if (dias === 1) return { texto: "vence amanhã", atrasado: false };
  if (dias > 1) return { texto: dias <= 30 ? `vence em ${dias} dias` : `prazo ${new Date(deadline + "T00:00:00").toLocaleDateString("pt-BR")}`, atrasado: false };
  return { texto: dias === -1 ? "venceu ontem" : `venceu há ${-dias} dias`, atrasado: true };
}
