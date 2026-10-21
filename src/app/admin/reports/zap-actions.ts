"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";
import { criarOrdem, statusAgente, telefoneDoJid } from "@/lib/whatsapp";
import { MESES } from "@/lib/relatorio-datas";

// Enviar o PDF do relatório pelo WhatsApp do escritório: a pessoa escolhe a
// conversa do cliente, confere a mensagem pronta e confirma. Quem manda é o
// Agente MC (ordem em wa_jobs, com quem pediu registrado).

export type DestinoZap = { jid: string; nome: string; grupo: boolean; sugerido: boolean };

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function prepararEnvioRelatorioAction(reportId: string): Promise<
  { ok: true; destinos: DestinoZap[]; mensagem: string; arquivo: string; agenteNoAr: boolean } | { ok: false; erro: string }
> {
  await exigirPermissao("relatorios", "whatsapp");
  const db = await createClient();
  const { data: r } = await db.from("monthly_reports").select("id, client_id, reference_month, reference_year, pdf_url, clients(name)").eq("id", reportId).maybeSingle();
  if (!r?.pdf_url) return { ok: false, erro: "Este relatório ainda não tem PDF." };
  const cliente = (r.clients as unknown as { name: string } | null)?.name ?? "cliente";
  const [{ data: chats }, agente] = await Promise.all([
    db.from("wa_chats").select("chat_jid, nome, is_group, ultima_msg_em").eq("client_id", r.client_id).order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(20),
    statusAgente(db),
  ]);
  const lista = chats ?? [];
  // sugestão: o grupo "Assessoria Jurídica" do cliente; senão, a conversa mais recente
  const sugerido = lista.find((c) => c.is_group && /assessoria\s+juridica/.test(semAcento(c.nome ?? ""))) ?? lista[0];
  const mes = `${MESES[r.reference_month]} de ${r.reference_year}`;
  const mensagem = [
    `Olá, ${cliente}! 👋`,
    "",
    `Segue o relatório de atividades de *${mes}* da MC Advogados, com o que foi concluído, o que está em andamento e os próximos passos.`,
    "",
    "Qualquer dúvida, estamos à disposição. 🤝",
    "",
    "_MC Advogados_",
  ].join("\n");
  return {
    ok: true,
    destinos: lista.map((c) => ({ jid: c.chat_jid, nome: c.nome || telefoneDoJid(c.chat_jid), grupo: c.is_group, sugerido: c.chat_jid === sugerido?.chat_jid })),
    mensagem,
    arquivo: `Relatório ${MESES[r.reference_month]} ${r.reference_year} - ${cliente}.pdf`,
    agenteNoAr: !!agente?.ligado,
  };
}

/** Busca qualquer conversa/grupo pelo nome ou número (quando o cliente não tem conversa ligada). */
export async function buscarConversaZapAction(termo: string): Promise<DestinoZap[]> {
  await exigirPermissao("relatorios", "whatsapp");
  const t = termo.replace(/[%_,()]/g, " ").trim();
  if (t.length < 2) return [];
  const db = await createClient();
  const dig = t.replace(/\D/g, "");
  const q = db.from("wa_chats").select("chat_jid, nome, is_group").limit(8);
  const { data } = await (dig.length >= 6 ? q.like("chat_jid", `%${dig}%`) : q.ilike("nome", `%${t}%`)).order("ultima_msg_em", { ascending: false, nullsFirst: false });
  return (data ?? []).map((c) => ({ jid: c.chat_jid, nome: c.nome || telefoneDoJid(c.chat_jid), grupo: c.is_group, sugerido: false }));
}

export async function enviarRelatorioZapAction(reportId: string, chatJid: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  const { profile } = await exigirPermissao("relatorios", "whatsapp");
  const db = await createClient();
  const [{ data: r }, { data: chat }, agente] = await Promise.all([
    db.from("monthly_reports").select("id, client_id, reference_month, reference_year, pdf_url, clients(name)").eq("id", reportId).maybeSingle(),
    db.from("wa_chats").select("chat_jid, client_id").eq("chat_jid", chatJid).maybeSingle(),
    statusAgente(db),
  ]);
  if (!r?.pdf_url) return { ok: false, erro: "Este relatório ainda não tem PDF." };
  if (!chat) return { ok: false, erro: "Escolha uma conversa do WhatsApp." };
  if (!agente?.ligado) return { ok: false, erro: "O WhatsApp do escritório está fora do ar agora. Tente em instantes." };
  const cliente = (r.clients as unknown as { name: string } | null)?.name ?? "cliente";
  await criarOrdem(db, {
    tipo: "enviar_arquivo",
    payload: {
      para: chatJid,
      texto: texto.trim().slice(0, 4000),
      quem: "humano",
      bucket: "documents",
      media_path: r.pdf_url,
      mime: "application/pdf",
      nome: `Relatório ${MESES[r.reference_month]} ${r.reference_year} - ${cliente}.pdf`,
    },
    chat_jid: chatJid,
    criado_por: profile.id,
  });
  await db.from("monthly_reports").update({ sent_at: new Date().toISOString() }).eq("id", reportId);
  revalidatePath("/admin/reports");
  revalidatePath(`/admin/clients/${r.client_id}`);
  return { ok: true };
}
