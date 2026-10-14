import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MESES } from "@/lib/relatorio-datas";
import { criarOrdem, resolverDestino, statusAgente, telefoneDoJid, type WaChat, type WaMensagem } from "@/lib/whatsapp";
import type { ToolDef } from "./tools";

// Ferramentas do WhatsApp para o assistente (só admin). Lêem o espelho que o
// Agente MC grava no banco; enviar = criar uma ordem em wa_jobs. Todo envio é
// kind "confirm": o portal mostra o cartão com destino + texto e só manda
// quando a pessoa clica em Confirmar.

const db = () => createAdminClient();
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const ALVO = { type: "string", description: "Destino: nome do contato no WhatsApp, nome do cliente cadastrado, telefone com DDD ou chat_jid" };

const nomeChat = (c: Pick<WaChat, "nome" | "chat_jid"> | null, para: string) => (c?.nome ? `${c.nome} (${telefoneDoJid(c.chat_jid)})` : telefoneDoJid(para.includes("@") ? para : `${para}@s.whatsapp.net`));
const curto = (t: string, n = 160) => (t.length > n ? `${t.slice(0, n)}…` : t);
const hora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Mensagem em uma linha pra IA ler ("[14/10 09:12] Cliente: texto"). */
function linha(m: WaMensagem): string {
  const quem = m.from_me ? (m.quem === "ia" ? "Escritório (IA)" : "Escritório") : m.sender_jid && m.chat_jid.endsWith("@g.us") ? telefoneDoJid(m.sender_jid) : "Contato";
  const midia = m.tipo !== "texto" ? `[${m.tipo}${m.media_nome ? `: ${m.media_nome}` : ""}] ` : "";
  return `[${hora(m.wa_timestamp)}] ${quem}: ${midia}${m.texto ?? ""}`.trim();
}

async function exigirAgente() {
  const a = await statusAgente(db());
  if (!a?.ligado || a.estado !== "conectado") throw new Error("O Agente MC está desligado (ou sem WhatsApp conectado). Ligue no computador e tente de novo.");
}

/** Destino único; se houver vários parecidos, para e pede pra escolher. */
async function destinoUnico(alvo: unknown) {
  const r = await resolverDestino(db(), String(alvo ?? ""));
  if (r.opcoes && r.opcoes.length > 1) {
    throw new Error(`Achei mais de uma conversa para "${alvo}": ${r.opcoes.map((c) => nomeChat(c, c.chat_jid)).join("; ")}. Diga qual.`);
  }
  return r;
}

/** Espera o Agente executar a ordem (até ~20s) pra responder se foi mesmo. */
async function aguardar(jobId: string, ms = 20_000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data } = await db().from("wa_jobs").select("status, erro, resultado").eq("id", jobId).maybeSingle();
    if (data?.status === "concluido") return { enviado: true };
    if (data?.status === "erro") throw new Error(`O Agente não conseguiu enviar: ${data.erro}`);
  }
  return { enviado: "na fila — o Agente envia em instantes (pausa de digitando para proteger o número)" };
}

async function relatorioDoMes(clientId: string, mes: number, ano: number) {
  const { data: c } = await db().from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!c) throw new Error("Cliente não encontrado.");
  const { data: r } = await db()
    .from("monthly_reports")
    .select("pdf_url")
    .eq("client_id", clientId)
    .eq("reference_month", mes)
    .eq("reference_year", ano)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!r?.pdf_url) throw new Error(`${c.name} ainda não tem relatório de ${MESES[mes]}/${ano}. Gere antes com gerar_relatorio.`);
  return { cliente: c, path: r.pdf_url, nome: `Relatório ${MESES[mes]} ${ano} - ${c.name}.pdf` };
}

/** Conversa do WhatsApp ligada ao cliente (vínculo feito na tela WhatsApp). */
async function chatDoCliente(clientId: string): Promise<WaChat> {
  const { data } = await db().from("wa_chats").select("*").eq("client_id", clientId).eq("is_group", false).order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(1);
  if (!data?.[0]) throw new Error("Esse cliente não tem conversa vinculada no WhatsApp. Informe o destino (nome/telefone) ou vincule na tela WhatsApp.");
  return data[0];
}

export const TOOLS_WHATSAPP: ToolDef[] = [
  {
    name: "whatsapp_status",
    soAdmin: true,
    kind: "read",
    label: "Conferiu o WhatsApp",
    description: "Diz se o Agente MC (ponte do WhatsApp) está ligado e qual número está conectado.",
    parameters: obj({}),
    run: async () => {
      const a = await statusAgente(db());
      if (!a) return { ligado: false, dica: "O Agente nunca foi ligado nesta conta." };
      return { ligado: a.ligado, estado: a.ligado ? a.estado : "desligado", numero: a.numero, maquina: a.label, tela: "/admin/whatsapp" };
    },
  },
  {
    name: "whatsapp_conversas",
    soAdmin: true,
    kind: "read",
    label: "Consultou conversas do WhatsApp",
    description:
      "Lista conversas do WhatsApp do escritório (chat_jid, nome, não lidas, última mensagem, cliente vinculado). Filtros: busca (nome/telefone), so_nao_lidas, sem_resposta (a última mensagem é do contato, ninguém respondeu).",
    parameters: obj({ busca: { type: "string" }, so_nao_lidas: { type: "boolean" }, sem_resposta: { type: "boolean" }, limite: { type: "integer" } }),
    run: async (a) => {
      let q = db()
        .from("wa_chats")
        .select("chat_jid, nome, is_group, nao_lidas, ultima_msg_em, ultima_msg_preview, client_id, clients(name)")
        .eq("arquivado", false)
        .order("ultima_msg_em", { ascending: false, nullsFirst: false })
        .limit(Math.min(Number(a.limite) || 30, 60));
      if (a.so_nao_lidas) q = q.gt("nao_lidas", 0);
      const termo = String(a.busca ?? "").replace(/[%_,()]/g, " ").trim();
      if (termo) {
        const dig = termo.replace(/\D/g, "");
        q = dig.length >= 6 ? q.like("chat_jid", `%${dig}%`) : q.ilike("nome", `%${termo}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      let lista = data ?? [];
      if (a.sem_resposta && lista.length) {
        const ultimas = await Promise.all(
          lista.map((c) => db().from("wa_messages").select("from_me").eq("chat_jid", c.chat_jid).order("wa_timestamp", { ascending: false }).limit(1).maybeSingle())
        );
        lista = lista.filter((_, i) => ultimas[i].data && !ultimas[i].data!.from_me);
      }
      return lista.map((c) => ({
        chat_jid: c.chat_jid,
        nome: c.nome ?? telefoneDoJid(c.chat_jid),
        telefone: telefoneDoJid(c.chat_jid),
        grupo: c.is_group,
        nao_lidas: c.nao_lidas,
        ultima: c.ultima_msg_em ? hora(c.ultima_msg_em) : null,
        previa: c.ultima_msg_preview,
        cliente: (c.clients as unknown as { name: string } | null)?.name ?? null,
      }));
    },
  },
  {
    name: "whatsapp_ler_conversa",
    soAdmin: true,
    kind: "read",
    label: "Leu a conversa do WhatsApp",
    description: "Lê as mensagens de uma conversa (para resumir, ver o que o cliente pediu, etc.). dias = quantos dias para trás (padrão 7).",
    parameters: obj({ alvo: ALVO, dias: { type: "integer" }, limite: { type: "integer" } }, ["alvo"]),
    run: async (a) => {
      const { para, chat } = await destinoUnico(a.alvo);
      const desde = new Date(Date.now() - (Number(a.dias) || 7) * 86_400_000).toISOString();
      const { data, error } = await db()
        .from("wa_messages")
        .select("*")
        .eq("chat_jid", para)
        .gte("wa_timestamp", desde)
        .order("wa_timestamp", { ascending: false })
        .limit(Math.min(Number(a.limite) || 80, 200));
      if (error) throw error;
      const msgs = (data ?? []).reverse();
      return { conversa: nomeChat(chat, para), chat_jid: para, total: msgs.length, mensagens: msgs.map(linha) };
    },
  },
  {
    name: "whatsapp_triagem",
    soAdmin: true,
    kind: "read",
    label: "Fez a triagem do WhatsApp",
    description:
      "Triagem: traz as conversas sem resposta do escritório (última mensagem é do contato) dos últimos dias, com as mensagens recentes de cada uma, para você classificar (urgente / cliente com demanda / possível cliente novo / pode esperar) e sugerir resposta. Não envia nada.",
    parameters: obj({ dias: { type: "integer", description: "padrão 3" }, incluir_grupos: { type: "boolean" } }),
    run: async (a) => {
      const desde = new Date(Date.now() - (Number(a.dias) || 3) * 86_400_000).toISOString();
      let q = db().from("wa_chats").select("chat_jid, nome, is_group, nao_lidas, client_id, lead_id, clients(name)").eq("arquivado", false).gte("ultima_msg_em", desde).order("ultima_msg_em", { ascending: false }).limit(40);
      if (!a.incluir_grupos) q = q.eq("is_group", false);
      const { data: chats, error } = await q;
      if (error) throw error;
      const saida = [];
      for (const c of chats ?? []) {
        const { data: ms } = await db().from("wa_messages").select("*").eq("chat_jid", c.chat_jid).order("wa_timestamp", { ascending: false }).limit(6);
        const recentes = (ms ?? []).reverse();
        const ultima = recentes[recentes.length - 1];
        if (!ultima || ultima.from_me) continue;
        saida.push({
          chat_jid: c.chat_jid,
          nome: c.nome ?? telefoneDoJid(c.chat_jid),
          telefone: telefoneDoJid(c.chat_jid),
          cliente_cadastrado: (c.clients as unknown as { name: string } | null)?.name ?? null,
          ja_e_lead: !!c.lead_id,
          esperando_desde: hora(ultima.wa_timestamp),
          mensagens: recentes.map(linha),
        });
        if (saida.length >= 15) break;
      }
      return { sem_resposta: saida.length, conversas: saida, dica: "Desconhecido com assunto jurídico pode virar lead (whatsapp_registrar_lead)." };
    },
  },
  {
    name: "whatsapp_enviar_mensagem",
    soAdmin: true,
    kind: "confirm",
    label: "Enviou mensagem no WhatsApp",
    description: "Envia uma mensagem de texto no WhatsApp do escritório. O portal mostra destino e texto e pede confirmação antes de enviar.",
    parameters: obj({ alvo: ALVO, texto: { type: "string" } }, ["alvo", "texto"]),
    descrever: async (a) => {
      const r = await resolverDestino(db(), String(a.alvo ?? "")).catch((e: Error) => ({ erro: e.message }) as const);
      if ("erro" in r) return `⚠ ${r.erro}`;
      return `Para ${nomeChat(r.chat, r.para)}${r.opcoes && r.opcoes.length > 1 ? " ⚠ há outras conversas com esse nome" : ""}:\n“${curto(String(a.texto ?? ""), 600)}”`;
    },
    run: async (a, ctx) => {
      const texto = String(a.texto ?? "").trim();
      if (!texto) throw new Error("Mensagem vazia.");
      await exigirAgente();
      const { para, chat } = await destinoUnico(a.alvo);
      const job = await criarOrdem(db(), { tipo: "enviar_mensagem", payload: { para, texto, quem: "ia" }, chat_jid: chat?.chat_jid ?? null, criado_por: ctx.profileId });
      return { para: nomeChat(chat, para), ...(await aguardar(job.id)) };
    },
  },
  {
    name: "whatsapp_enviar_relatorio",
    soAdmin: true,
    kind: "confirm",
    label: "Enviou relatório no WhatsApp",
    description:
      "Envia no WhatsApp o PDF do relatório mensal já gerado do cliente (mes 1-12), com um texto curto. Destino padrão: a conversa vinculada ao cliente; ou informe alvo. Se o relatório não existir, gere antes com gerar_relatorio. Pede confirmação.",
    parameters: obj({ client_id: { type: "string" }, mes: { type: "integer" }, ano: { type: "integer" }, alvo: ALVO, texto: { type: "string", description: "mensagem que acompanha o PDF" } }, ["client_id", "mes", "ano"]),
    descrever: async (a) => {
      try {
        const rel = await relatorioDoMes(String(a.client_id), Number(a.mes), Number(a.ano));
        const destino = a.alvo ? await resolverDestino(db(), String(a.alvo)) : { chat: await chatDoCliente(rel.cliente.id), para: "" };
        return `📄 ${rel.nome}\nPara ${nomeChat(destino.chat, destino.para)}${a.texto ? `:\n“${curto(String(a.texto), 400)}”` : ""}`;
      } catch (e) {
        return `⚠ ${(e as Error).message}`;
      }
    },
    run: async (a, ctx) => {
      await exigirAgente();
      const rel = await relatorioDoMes(String(a.client_id), Number(a.mes), Number(a.ano));
      const destino = a.alvo ? await destinoUnico(a.alvo) : await chatDoCliente(rel.cliente.id).then((c) => ({ para: c.chat_jid, chat: c }));
      const texto = String(a.texto ?? "").trim() || `Olá! Segue o relatório de ${MESES[Number(a.mes)]} de ${a.ano} das atividades da MC Advogados. Qualquer dúvida, estamos à disposição.`;
      const job = await criarOrdem(db(), {
        tipo: "enviar_arquivo",
        payload: { para: destino.para, texto, quem: "ia", bucket: "documents", media_path: rel.path, mime: "application/pdf", nome: rel.nome },
        chat_jid: destino.chat?.chat_jid ?? null,
        criado_por: ctx.profileId,
      });
      return { relatorio: rel.nome, para: nomeChat(destino.chat, destino.para), ...(await aguardar(job.id, 30_000)) };
    },
  },
  {
    name: "whatsapp_enviar_lote",
    soAdmin: true,
    kind: "confirm",
    label: "Enviou mensagens em lote no WhatsApp",
    description:
      "Envia várias mensagens de uma vez (uma por destino, ex.: aviso para vários clientes). O Agente espaça os envios em 8-20s para proteger o número. Máximo 30. Pede confirmação.",
    parameters: obj(
      { itens: { type: "array", items: obj({ alvo: ALVO, texto: { type: "string" } }, ["alvo", "texto"]) } },
      ["itens"]
    ),
    descrever: async (a) => {
      const itens = (Array.isArray(a.itens) ? a.itens : []) as { alvo?: string; texto?: string }[];
      const linhas = await Promise.all(
        itens.slice(0, 30).map(async (i) => {
          const r = await resolverDestino(db(), String(i.alvo ?? "")).catch(() => null);
          return `• ${r ? nomeChat(r.chat, r.para) : `⚠ ${i.alvo} (não achei)`}: “${curto(String(i.texto ?? ""), 90)}”`;
        })
      );
      return `${itens.length} mensagem(ns):\n${linhas.join("\n")}${itens.length > 30 ? "\n⚠ só as 30 primeiras" : ""}`;
    },
    run: async (a, ctx) => {
      await exigirAgente();
      const itens = ((Array.isArray(a.itens) ? a.itens : []) as { alvo?: string; texto?: string }[]).slice(0, 30);
      if (!itens.length) throw new Error("Nenhuma mensagem no lote.");
      const prontos = [];
      for (const i of itens) {
        const { para } = await destinoUnico(i.alvo);
        const texto = String(i.texto ?? "").trim();
        if (texto) prontos.push({ para, texto, quem: "ia" });
      }
      const job = await criarOrdem(db(), { tipo: "enviar_lote", payload: { itens: prontos, quem: "ia" }, criado_por: ctx.profileId });
      return { na_fila: prontos.length, tempo_estimado: `~${Math.ceil((prontos.length * 17) / 60)} min`, acompanhar: "/admin/whatsapp", ordem: job.id };
    },
  },
  {
    name: "whatsapp_vincular_cliente",
    soAdmin: true,
    kind: "write",
    label: "Vinculou conversa ao cliente",
    description: "Liga uma conversa do WhatsApp a um cliente cadastrado (client_id; vazio = desvincular). Assim a IA acha o WhatsApp do cliente pelo nome.",
    parameters: obj({ alvo: ALVO, client_id: { type: "string" } }, ["alvo"]),
    run: async (a) => {
      const { para, chat } = await destinoUnico(a.alvo);
      if (!chat) throw new Error("Essa conversa ainda não existe no espelho.");
      const clientId = a.client_id ? String(a.client_id) : null;
      const { error } = await db().from("wa_chats").update({ client_id: clientId }).eq("chat_jid", para);
      if (error) throw error;
      return { conversa: nomeChat(chat, para), vinculado: !!clientId };
    },
  },
  {
    name: "whatsapp_registrar_lead",
    soAdmin: true,
    kind: "write",
    label: "Registrou lead do WhatsApp",
    description: "Registra (ou atualiza) um possível cliente vindo do WhatsApp, com área jurídica, resumo do caso e nota 0-100 de quão quente está.",
    parameters: obj(
      {
        alvo: ALVO,
        nome: { type: "string" },
        area: { type: "string" },
        resumo: { type: "string" },
        score: { type: "integer" },
        status: { type: "string", enum: ["novo", "qualificando", "quente", "cliente", "perdido"] },
      },
      ["alvo"]
    ),
    run: async (a) => {
      const { para, chat } = await destinoUnico(a.alvo);
      if (!chat) throw new Error("Essa conversa ainda não existe no espelho.");
      const campos = {
        nome: a.nome ? String(a.nome) : chat.nome,
        telefone: para.split("@")[0],
        chat_jid: para,
        area: a.area ? String(a.area) : undefined,
        resumo: a.resumo ? String(a.resumo) : undefined,
        score: a.score != null ? Math.max(0, Math.min(100, Number(a.score))) : undefined,
        status: (a.status ? String(a.status) : undefined) as "novo" | undefined,
        updated_at: new Date().toISOString(),
      };
      if (chat.lead_id) {
        const { error } = await db().from("leads").update(campos).eq("id", chat.lead_id);
        if (error) throw error;
        return { lead: campos.nome, atualizado: true };
      }
      const { data, error } = await db().from("leads").insert(campos).select("id").single();
      if (error) throw error;
      await db().from("wa_chats").update({ lead_id: data.id }).eq("chat_jid", para);
      return { lead: campos.nome, criado: true };
    },
  },
];
