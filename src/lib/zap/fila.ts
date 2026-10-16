import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Fila de envios do WhatsApp (tabela wa_jobs). O Agente MC pega o que já
// venceu (agendado_para <= agora) e manda pelo número conectado. origem_ref
// identifica de onde veio o envio, para cancelar/remarcar sem duplicar.

export async function enfileirarMensagem({
  para,
  texto,
  agendadoPara,
  expiraEm,
  origemRef,
  criadoPor,
}: {
  /** telefone (só dígitos, com DDD) ou JID da conversa/grupo */
  para: string;
  texto: string;
  agendadoPara?: Date | null;
  /** depois disso o Agente descarta em vez de mandar atrasado */
  expiraEm?: Date | null;
  origemRef: string;
  criadoPor?: string | null;
}): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("wa_jobs")
    .insert({
      tipo: "enviar_mensagem",
      payload: { para, texto, quem: "ia", ...(expiraEm ? { expira_em: expiraEm.toISOString() } : {}) },
      chat_jid: para.includes("@") ? para : null,
      agendado_para: agendadoPara ? agendadoPara.toISOString() : null,
      origem_ref: origemRef,
      criado_por: criadoPor ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("fila do zap:", error.message);
    return null;
  }
  return data.id;
}

/** Cancela os envios ainda pendentes cuja origem começa com `prefixo`. */
export async function cancelarPendentes(prefixo: string): Promise<void> {
  await createAdminClient()
    .from("wa_jobs")
    .update({ status: "cancelado", concluido_em: new Date().toISOString() })
    .eq("status", "pendente")
    .like("origem_ref", `${prefixo}%`);
}

/** Envios (pendentes e feitos) de uma origem, para mostrar na tela. */
export async function enviosDe(prefixo: string) {
  const { data } = await createAdminClient()
    .from("wa_jobs")
    .select("id, status, agendado_para, concluido_em, erro, origem_ref")
    .like("origem_ref", `${prefixo}%`)
    .order("agendado_para", { ascending: true });
  return data ?? [];
}

/** Destino do cliente no Zap: 1º grupo vinculado; senão a conversa ou o 1º número cadastrado. */
export async function destinoDoCliente(clientId: string): Promise<{ para: string; rotulo: string } | null> {
  const db = createAdminClient();
  const [{ data: cliente }, { data: chats }] = await Promise.all([
    db.from("clients").select("whatsapp_grupos, whatsapp_numeros").eq("id", clientId).maybeSingle(),
    db.from("wa_chats").select("chat_jid, nome, is_group").eq("client_id", clientId).order("ultima_msg_em", { ascending: false, nullsFirst: false }),
  ]);
  const grupo = (chats ?? []).find((c) => c.is_group);
  if (grupo) return { para: grupo.chat_jid, rotulo: `grupo “${grupo.nome ?? "do cliente"}”` };
  const contato = (chats ?? []).find((c) => !c.is_group && c.chat_jid.endsWith("@s.whatsapp.net"));
  if (contato) return { para: contato.chat_jid, rotulo: `contato ${contato.nome ?? contato.chat_jid.split("@")[0]}` };
  const numero = cliente?.whatsapp_numeros?.[0];
  if (numero) return { para: numero.replace(/\D/g, ""), rotulo: `número ${numero}` };
  return null;
}

/** Por onde sairia o lembrete de cada cliente (para avisar no formulário). */
export async function destinosDosClientes(ids: string[]): Promise<Record<string, string | null>> {
  if (!ids.length) return {};
  const db = createAdminClient();
  const [{ data: clientes }, { data: chats }] = await Promise.all([
    db.from("clients").select("id, whatsapp_numeros").in("id", ids),
    db.from("wa_chats").select("client_id, nome, is_group, chat_jid").in("client_id", ids),
  ]);
  const out: Record<string, string | null> = {};
  for (const c of clientes ?? []) {
    const doCliente = (chats ?? []).filter((x) => x.client_id === c.id);
    const grupo = doCliente.find((x) => x.is_group);
    const contato = doCliente.find((x) => !x.is_group && x.chat_jid.endsWith("@s.whatsapp.net"));
    out[c.id] = grupo
      ? `grupo “${grupo.nome ?? "do cliente"}”`
      : contato
        ? `contato ${contato.nome ?? contato.chat_jid.split("@")[0]}`
        : c.whatsapp_numeros?.[0]
          ? `número ${c.whatsapp_numeros[0]}`
          : null;
  }
  return out;
}
