import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { tudo } from "./metricas";
import type { LinhaAtividade, LinhaCliente, LinhaResp } from "./base";

// Linhas enxutas para os quadros do painel filtrarem no navegador.
const db = () => createAdminClient() as unknown as SupabaseClient;

export type Base = { atividades: LinhaAtividade[]; clientes: LinhaCliente[]; responsaveis: LinhaResp[] };

export async function carregarBase(): Promise<Base> {
  type A = { id: string; title: string; status: string; type: string; area: string | null; categoria: string | null; created_at: string; concluida_em: string | null; deadline: string | null; hora: string | null; updated_at: string; client_id: string | null; responsavel_id: string | null; envolvidos: string[] | null };
  const [ats, dist, cls, rs] = await Promise.all([
    tudo<A>((a, b) => db().from("activities").select("id, title, status, type, area, categoria, created_at, concluida_em, deadline, hora, updated_at, client_id, responsavel_id, envolvidos").is("archived_at", null).range(a, b)),
    tudo<{ activity_id: string; created_at: string }>((a, b) => db().from("distribuicao").select("activity_id, created_at").not("activity_id", "is", null).range(a, b)),
    tudo<{ id: string; name: string; tipo_pessoa: string; active: boolean }>((a, b) => db().from("clients").select("id, name, tipo_pessoa, active").range(a, b)),
    tudo<{ id: string; nome: string; profile_id: string | null; foto_url: string | null; areas: string[] | null }>((a, b) => db().from("responsaveis").select("id, nome, profile_id, foto_url, areas").range(a, b)),
  ]);
  const pedido = new Map(dist.map((d) => [d.activity_id, d.created_at]));
  return {
    atividades: ats.map((x) => ({
      id: x.id,
      titulo: x.title,
      status: x.status,
      tipo: x.type,
      area: x.area,
      categoria: x.categoria ?? "tarefa",
      criada: x.created_at,
      pedido: pedido.get(x.id) ?? x.created_at,
      concluida: x.concluida_em,
      prazo: x.deadline,
      hora: x.hora ? x.hora.slice(0, 5) : null,
      atualizada: x.updated_at,
      clienteId: x.client_id,
      respId: x.responsavel_id,
      envolvidos: x.envolvidos ?? [],
    })),
    clientes: cls.map((c) => ({ id: c.id, nome: c.name, pf: c.tipo_pessoa === "PF", ativo: c.active })),
    responsaveis: rs.map((r) => ({ id: r.id, nome: r.nome, profileId: r.profile_id, foto: r.foto_url, areas: r.areas ?? [] })).sort((a, b) => a.nome.localeCompare(b.nome)),
  };
}
