import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { MAURICIO } from "@/lib/rotina-relatorio/dia";

// Prazo travado (05/11/2026, pedido do usuário): a equipe não muda o prazo de
// uma atividade que já tem prazo. Pede (nova data + justificativa) e o admin
// máximo aprova ou recusa. A trava de verdade é no banco (migration 0069,
// trigger trava_prazo_atividade); aqui ficam o pedido, a decisão e os avisos.
// Pôr o PRIMEIRO prazo continua livre.

const db = () => createAdminClient() as unknown as SupabaseClient;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br";

export type PedidoPrazo = {
  id: string;
  activity_id: string;
  pedido_por: string;
  prazo_atual: string | null;
  prazo_novo: string | null;
  justificativa: string;
  status: "pendente" | "aprovado" | "recusado" | "cancelado";
  resposta: string | null;
  created_at: string;
  decidido_em: string | null;
  atividade?: string;
  cliente?: string | null;
  quem?: string;
};

export const dataBr = (d: string | null) => (d ? d.split("-").reverse().join("/") : "sem prazo");
/** Mensagem do banco quando a trava barra a mudança. */
export const ehPrazoTravado = (msg: string | undefined | null) => /PRAZO_TRAVADO/.test(msg ?? "");
export const MSG_TRAVADO = "Mudar o prazo precisa de autorização do Dr. Maurício. Abra a atividade e use Pedir mudança de prazo.";

async function telefoneDe(profileId: string): Promise<string | null> {
  const { data } = await db().from("responsaveis").select("telefone").eq("profile_id", profileId).maybeSingle();
  const t = String(data?.telefone ?? "").replace(/\D/g, "");
  return t.length >= 10 ? t : null;
}

export async function pedidoPendente(activityId: string): Promise<PedidoPrazo | null> {
  const { data } = await db().from("prazo_pedidos").select("*").eq("activity_id", activityId).eq("status", "pendente").maybeSingle();
  return (data as PedidoPrazo | null) ?? null;
}

/** A pessoa pede a mudança. Quem chama já conferiu que ela vê a atividade. */
export async function pedirMudancaPrazo(p: { profileId: string; nome: string; activityId: string; prazoNovo: string | null; justificativa: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const just = p.justificativa.trim();
  if (just.length < 5) return { ok: false, error: "Escreva a justificativa (por que o prazo precisa mudar)." };
  if (p.prazoNovo !== null && !/^\d{4}-\d{2}-\d{2}$/.test(p.prazoNovo)) return { ok: false, error: "Data inválida." };
  const { data: a } = await db().from("activities").select("id, title, deadline, clients(name)").eq("id", p.activityId).maybeSingle();
  if (!a) return { ok: false, error: "Atividade não encontrada." };
  if ((a.deadline ?? null) === p.prazoNovo) return { ok: false, error: "A nova data é igual ao prazo atual." };
  const { error } = await db().from("prazo_pedidos").insert({ activity_id: a.id, pedido_por: p.profileId, prazo_atual: a.deadline, prazo_novo: p.prazoNovo, justificativa: just.slice(0, 1000) });
  if (error) return { ok: false, error: /prazo_pedidos_um_pendente|duplicate/.test(error.message) ? "Já existe um pedido aguardando o Dr. Maurício para esta atividade." : "Não foi possível registrar o pedido." };
  const tel = await telefoneDe(MAURICIO);
  if (tel) {
    const cliente = (a.clients as unknown as { name: string } | null)?.name;
    await enfileirarMensagem({
      para: tel,
      texto: `*Pedido de mudança de prazo*\n${p.nome} pediu para mudar o prazo de "${a.title}"${cliente ? ` (${cliente})` : ""}\nde ${dataBr(a.deadline)} para *${dataBr(p.prazoNovo)}*.\n\nJustificativa: ${just}\n\nAprovar ou recusar: ${SITE}/admin/alertas?aba=prazos`,
      origemRef: `prazo-pedido:${a.id}:${Date.now()}`,
    }).catch(() => null);
  }
  return { ok: true };
}

export async function cancelarPedidoPrazo(profileId: string, pedidoId: string): Promise<boolean> {
  const { data } = await db().from("prazo_pedidos").update({ status: "cancelado", decidido_em: new Date().toISOString() }).eq("id", pedidoId).eq("pedido_por", profileId).eq("status", "pendente").select("id");
  return !!data?.length;
}

/** O admin máximo decide. Aprovado: o servidor muda o prazo (a trava só vale para logins). */
export async function decidirPedidoPrazo(p: { decididoPor: string; pedidoId: string; aprovar: boolean; resposta?: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: ped } = await db().from("prazo_pedidos").select("*, activities(title)").eq("id", p.pedidoId).maybeSingle();
  if (!ped) return { ok: false, error: "Pedido não encontrado." };
  if (ped.status !== "pendente") return { ok: false, error: "Este pedido já foi decidido." };
  if (p.aprovar) {
    const { error } = await db().from("activities").update({ deadline: ped.prazo_novo }).eq("id", ped.activity_id);
    if (error) return { ok: false, error: "Não foi possível mudar o prazo da atividade." };
  }
  const resposta = p.resposta?.trim().slice(0, 500) || null;
  await db()
    .from("prazo_pedidos")
    .update({ status: p.aprovar ? "aprovado" : "recusado", decidido_por: p.decididoPor, decidido_em: new Date().toISOString(), resposta })
    .eq("id", ped.id);
  const tel = await telefoneDe(ped.pedido_por);
  if (tel) {
    const titulo = (ped.activities as { title: string } | null)?.title ?? "atividade";
    await enfileirarMensagem({
      para: tel,
      texto: p.aprovar
        ? `✅ O Dr. Maurício *aprovou* a mudança de prazo de "${titulo}": agora é ${dataBr(ped.prazo_novo)}.${resposta ? `\n${resposta}` : ""}`
        : `❌ O Dr. Maurício *recusou* a mudança de prazo de "${titulo}". O prazo continua ${dataBr(ped.prazo_atual)}.${resposta ? `\nMotivo: ${resposta}` : ""}`,
      origemRef: `prazo-decisao:${ped.id}`,
    }).catch(() => null);
  }
  return { ok: true };
}

export async function listarPedidosPrazo(status: "pendente" | "decididos" = "pendente", limite = 50): Promise<PedidoPrazo[]> {
  let q = db().from("prazo_pedidos").select("*, activities(title, clients(name)), profiles!prazo_pedidos_pedido_por_fkey(full_name)").order("created_at", { ascending: false }).limit(limite);
  q = status === "pendente" ? q.eq("status", "pendente") : q.neq("status", "pendente");
  const { data } = await q;
  return (data ?? []).map((r) => {
    const at = r.activities as { title: string; clients: { name: string } | null } | null;
    return { ...(r as PedidoPrazo), atividade: at?.title ?? "(atividade)", cliente: at?.clients?.name ?? null, quem: (r.profiles as { full_name: string } | null)?.full_name ?? "" };
  });
}

export async function contarPedidosPrazo(): Promise<number> {
  const { count } = await db().from("prazo_pedidos").select("id", { count: "exact", head: true }).eq("status", "pendente");
  return count ?? 0;
}

/**
 * Para caminhos que usam a chave de serviço (Assistente do admin, MCP), onde a
 * trava do banco não vale: barra mudar um prazo que já existe se a pessoa não
 * é o admin máximo.
 */
export async function conferirMudancaDePrazo(superAdmin: boolean, ids: string[], novo: string | null): Promise<void> {
  if (superAdmin || !ids.length) return;
  const { data } = await db().from("activities").select("id, deadline").in("id", ids.slice(0, 500));
  if ((data ?? []).some((a) => a.deadline && a.deadline !== novo)) throw new Error(`${MSG_TRAVADO} (pelo Assistente: pedir_mudanca_prazo)`);
}

export async function ehSuperAdminId(profileId: string): Promise<boolean> {
  const { data } = await db().from("profiles").select("role, super_admin").eq("id", profileId).maybeSingle();
  return data?.role === "admin" && !!data.super_admin;
}
