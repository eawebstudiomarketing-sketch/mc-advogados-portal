"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { getActivity } from "@/lib/data/activities";
import { getEscritorioConfig } from "@/lib/data/escritorio";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinoDoCliente, enfileirarMensagem } from "@/lib/zap/fila";

// Botão "Avisar o cliente no Zap" (29/10/2026): a atividade concluída vira uma
// mensagem para o cliente. Nunca sai sozinha: a pessoa vê o texto, pode editar
// e confirma. O selo "cliente avisado" evita aviso em dobro.

export type PreparoAviso =
  | { ok: true; texto: string; destino: string; avisadoEm: string | null }
  | { ok: false; error: string };

const preencher = (modelo: string, titulo: string, cliente: string | null) =>
  modelo.replaceAll("{titulo}", titulo).replaceAll("{cliente}", cliente ?? "");

export async function prepararAvisoAction(activityId: string): Promise<PreparoAviso> {
  await requireRole(["admin", "advogado"]);
  const a = await getActivity(activityId); // o banco já limita ao que a pessoa pode ver
  if (!a) return { ok: false, error: "Atividade não encontrada." };
  if (a.status !== "concluida") return { ok: false, error: "Marque a atividade como concluída antes de avisar o cliente." };
  if (!a.client_id) return { ok: false, error: "Esta atividade não tem cliente." };
  const destino = await destinoDoCliente(a.client_id);
  if (!destino) return { ok: false, error: "Este cliente não tem WhatsApp vinculado. Vincule o grupo ou o número na ficha dele." };
  const config = await getEscritorioConfig();
  return { ok: true, texto: preencher(config.aviso_concluida, a.title, a.clients?.name ?? null), destino: destino.rotulo, avisadoEm: a.cliente_avisado_em };
}

export async function enviarAvisoAction(
  activityId: string,
  texto: string,
  salvarComoPadrao: boolean
): Promise<{ ok: true; avisadoEm: string } | { ok: false; error: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  const a = await getActivity(activityId);
  if (!a) return { ok: false, error: "Atividade não encontrada." };
  if (a.status !== "concluida") return { ok: false, error: "A atividade não está concluída." };
  if (!a.client_id) return { ok: false, error: "Esta atividade não tem cliente." };
  const msg = texto.trim();
  if (msg.length < 5 || msg.length > 1500) return { ok: false, error: "O texto precisa ter entre 5 e 1.500 caracteres." };
  const destino = await destinoDoCliente(a.client_id);
  if (!destino) return { ok: false, error: "Este cliente não tem WhatsApp vinculado." };

  const db = createAdminClient();
  // o texto-modelo fica fixo: só admin grava, e o título/nome voltam a ser {titulo}/{cliente}
  if (salvarComoPadrao && profile.role === "admin") {
    let modelo = msg.replaceAll(a.title, "{titulo}");
    if (a.clients?.name) modelo = modelo.replaceAll(a.clients.name, "{cliente}");
    await db.from("escritorio_config").update({ aviso_concluida: modelo, updated_at: new Date().toISOString() }).eq("id", 1);
  }

  const job = await enfileirarMensagem({
    para: destino.para,
    texto: msg,
    origemRef: `aviso-concluida:${a.id}:${Date.now()}`,
    expiraEm: new Date(Date.now() + 24 * 3_600_000),
    criadoPor: profile.id,
  });
  if (!job) return { ok: false, error: "Não foi possível colocar a mensagem na fila do WhatsApp. Tente de novo." };

  const agora = new Date().toISOString();
  await db.from("activities").update({ cliente_avisado_em: agora, cliente_avisado_por: profile.id }).eq("id", a.id);
  revalidatePath("/admin/activities");
  return { ok: true, avisadoEm: agora };
}
