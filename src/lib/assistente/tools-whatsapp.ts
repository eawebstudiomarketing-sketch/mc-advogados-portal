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
  const quem = m.from_me
    ? m.quem === "ia" ? "Escritório (IA)" : "Escritório"
    : m.chat_jid.endsWith("@g.us") ? m.sender_nome || (m.sender_jid ? telefoneDoJid(m.sender_jid) : "Participante") : "Contato";
  const midia = m.tipo !== "texto" ? `[${m.tipo}${m.media_nome ? `: ${m.media_nome}` : ""}] ` : "";
  return `[${hora(m.wa_timestamp)}]${m.wa_id ? ` (wa_id=${m.wa_id})` : ""} ${quem}: ${midia}${m.texto ?? ""}`.trim();
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

/** Espera a ordem e devolve o resultado (perfil, dados do grupo...). */
async function resultadoDa(jobId: string, ms = 20_000): Promise<Record<string, unknown>> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 1000));
    const { data } = await db().from("wa_jobs").select("status, erro, resultado").eq("id", jobId).maybeSingle();
    if (data?.status === "concluido") return { ok: true, ...((data.resultado ?? {}) as Record<string, unknown>) };
    if (data?.status === "erro") throw new Error(`O Agente não conseguiu: ${data.erro}`);
  }
  return { ok: "na fila — o Agente faz em instantes" };
}

/** Cria a ordem e espera o Agente. */
async function ordem(tipo: string, payload: Record<string, unknown>, chatJid: string | null, criadoPor: string, ms?: number) {
  await exigirAgente();
  const job = await criarOrdem(db(), { tipo, payload, chat_jid: chatJid, criado_por: criadoPor });
  return resultadoDa(job.id, ms);
}

/** Mensagem pelo wa_id (dentro da conversa). */
async function mensagemPorWaId(chatJid: string, waId: unknown) {
  const { data } = await db().from("wa_messages").select("*").eq("chat_jid", chatJid).eq("wa_id", String(waId ?? "")).maybeSingle();
  if (!data) throw new Error("Não achei essa mensagem (pegue o wa_id em whatsapp_ler_conversa).");
  return data;
}

/** Grupo pelo nome/jid. */
async function grupoUnico(alvo: unknown) {
  const r = await destinoUnico(alvo);
  if (!r.para.endsWith("@g.us")) throw new Error(`"${alvo}" não é um grupo.`);
  return r;
}

/** Pessoas (nome do contato ou telefone) → jids individuais. */
async function jidsDePessoas(lista: unknown): Promise<string[]> {
  const itens = (Array.isArray(lista) ? lista : String(lista ?? "").split(/[,;]/)).map((x) => String(x).trim()).filter(Boolean);
  const out: string[] = [];
  for (const i of itens) {
    const r = await destinoUnico(i);
    if (r.para.endsWith("@g.us")) throw new Error(`"${i}" é um grupo, não uma pessoa.`);
    out.push(r.para);
  }
  if (!out.length) throw new Error("Diga quem (nomes ou telefones).");
  return out;
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
async function chatDoCliente(clientId: string, preferirAssessoria = false): Promise<WaChat> {
  if (preferirAssessoria) {
    const { data: grupos } = await db().from("wa_chats").select("*").eq("client_id", clientId).eq("is_group", true);
    const g = (grupos ?? []).find((c) => /assessoria\s+juridica/.test((c.nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
    if (g) return g;
  }
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
      "Envia no WhatsApp o PDF do relatório mensal já gerado do cliente (mes 1-12), com um texto curto. Destino padrão: o grupo “Assessoria Jurídica” do cliente (senão a conversa vinculada); ou informe alvo. Se o relatório não existir, gere antes com gerar_relatorio. Pede confirmação.",
    parameters: obj({ client_id: { type: "string" }, mes: { type: "integer" }, ano: { type: "integer" }, alvo: ALVO, texto: { type: "string", description: "mensagem que acompanha o PDF" } }, ["client_id", "mes", "ano"]),
    descrever: async (a) => {
      try {
        const rel = await relatorioDoMes(String(a.client_id), Number(a.mes), Number(a.ano));
        const destino = a.alvo ? await resolverDestino(db(), String(a.alvo)) : { chat: await chatDoCliente(rel.cliente.id, true), para: "" };
        return `📄 ${rel.nome}\nPara ${nomeChat(destino.chat, destino.para)}${a.texto ? `:\n“${curto(String(a.texto), 400)}”` : ""}`;
      } catch (e) {
        return `⚠ ${(e as Error).message}`;
      }
    },
    run: async (a, ctx) => {
      await exigirAgente();
      const rel = await relatorioDoMes(String(a.client_id), Number(a.mes), Number(a.ano));
      const destino = a.alvo ? await destinoUnico(a.alvo) : await chatDoCliente(rel.cliente.id, true).then((c) => ({ para: c.chat_jid, chat: c }));
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
  // ───────── ações como no app (reagir, editar, apagar, encaminhar, conversa, perfil, grupos) ─────────
  {
    name: "whatsapp_reagir",
    soAdmin: true,
    kind: "confirm",
    label: "Reagiu a mensagem no WhatsApp",
    description: "Reage a uma mensagem com um emoji (emoji vazio tira a reação). wa_id vem de whatsapp_ler_conversa.",
    parameters: obj({ alvo: ALVO, wa_id: { type: "string" }, emoji: { type: "string" } }, ["alvo", "wa_id", "emoji"]),
    descrever: async (a) => {
      const { para, chat } = await destinoUnico(a.alvo);
      const m = await mensagemPorWaId(para, a.wa_id).catch(() => null);
      return `${a.emoji || "(tirar reação)"} em ${nomeChat(chat, para)}${m?.texto ? `:\n“${curto(m.texto, 200)}”` : ""}`;
    },
    run: async (a, ctx) => {
      const { para } = await destinoUnico(a.alvo);
      await mensagemPorWaId(para, a.wa_id);
      return ordem("reagir", { chat_jid: para, wa_id: String(a.wa_id), emoji: String(a.emoji ?? "") }, para, ctx.profileId);
    },
  },
  {
    name: "whatsapp_editar_mensagem",
    soAdmin: true,
    kind: "confirm",
    label: "Editou mensagem no WhatsApp",
    description: "Edita uma mensagem que o escritório mandou (o WhatsApp só deixa até 15 min depois).",
    parameters: obj({ alvo: ALVO, wa_id: { type: "string" }, texto: { type: "string" } }, ["alvo", "wa_id", "texto"]),
    descrever: async (a) => {
      const { para, chat } = await destinoUnico(a.alvo);
      return `Editar mensagem em ${nomeChat(chat, para)} para:\n“${curto(String(a.texto), 400)}”`;
    },
    run: async (a, ctx) => {
      const { para } = await destinoUnico(a.alvo);
      const m = await mensagemPorWaId(para, a.wa_id);
      if (!m.from_me) throw new Error("Só dá para editar mensagem enviada pelo escritório.");
      if (Date.now() - new Date(m.wa_timestamp).getTime() > 15 * 60_000) throw new Error("Passou dos 15 minutos: o WhatsApp não deixa mais editar.");
      return ordem("editar", { chat_jid: para, wa_id: String(a.wa_id), texto: String(a.texto) }, para, ctx.profileId);
    },
  },
  {
    name: "whatsapp_apagar_para_todos",
    soAdmin: true,
    kind: "delete",
    label: "Apagou mensagem para todos",
    description: "Apaga para todos uma mensagem enviada pelo escritório.",
    parameters: obj({ alvo: ALVO, wa_id: { type: "string" } }, ["alvo", "wa_id"]),
    descrever: async (a) => {
      const { para, chat } = await destinoUnico(a.alvo);
      const m = await mensagemPorWaId(para, a.wa_id).catch(() => null);
      return `Apagar para todos em ${nomeChat(chat, para)}${m?.texto ? `: “${curto(m.texto, 200)}”` : ""}`;
    },
    run: async (a, ctx) => {
      const { para } = await destinoUnico(a.alvo);
      const m = await mensagemPorWaId(para, a.wa_id);
      if (!m.from_me) throw new Error("Só dá para apagar para todos mensagem enviada pelo escritório.");
      return ordem("apagar_para_todos", { chat_jid: para, wa_id: String(a.wa_id) }, para, ctx.profileId);
    },
  },
  {
    name: "whatsapp_encaminhar",
    soAdmin: true,
    kind: "confirm",
    label: "Encaminhou mensagem no WhatsApp",
    description: "Encaminha uma mensagem (de: conversa de origem + wa_id) para outra conversa (para).",
    parameters: obj({ de: ALVO, wa_id: { type: "string" }, para: ALVO }, ["de", "wa_id", "para"]),
    descrever: async (a) => {
      const [o, d] = await Promise.all([destinoUnico(a.de), destinoUnico(a.para)]);
      const m = await mensagemPorWaId(o.para, a.wa_id).catch(() => null);
      return `Encaminhar${m?.texto ? ` “${curto(m.texto, 200)}”` : " a mensagem"}\nDe ${nomeChat(o.chat, o.para)} para ${nomeChat(d.chat, d.para)}`;
    },
    run: async (a, ctx) => {
      const [o, d] = await Promise.all([destinoUnico(a.de), destinoUnico(a.para)]);
      await mensagemPorWaId(o.para, a.wa_id);
      return ordem("encaminhar", { wa_id: String(a.wa_id), para: d.para, chat_jid: o.para }, d.para, ctx.profileId);
    },
  },
  {
    name: "whatsapp_ajustar_conversa",
    soAdmin: true,
    kind: "write",
    label: "Ajustou conversa do WhatsApp",
    description: "Fixa, arquiva, silencia ou marca como lida uma conversa (valor=false desfaz).",
    parameters: obj({ alvo: ALVO, acao: { type: "string", enum: ["fixar", "arquivar", "silenciar", "lida"] }, valor: { type: "boolean" } }, ["alvo", "acao"]),
    run: async (a, ctx) => {
      const { para, chat } = await destinoUnico(a.alvo);
      const r = await ordem("conversa", { chat_jid: para, acao: String(a.acao), valor: a.valor !== false }, para, ctx.profileId, 10_000);
      return { conversa: nomeChat(chat, para), acao: a.acao, valor: a.valor !== false, ...r };
    },
  },
  {
    name: "whatsapp_perfil",
    soAdmin: true,
    kind: "read",
    label: "Viu o perfil no WhatsApp",
    description: "Dados de um contato (recado, nome, empresa) ou de um grupo (descrição, participantes, admins, configurações).",
    parameters: obj({ alvo: ALVO }, ["alvo"]),
    run: async (a, ctx) => {
      const { para, chat } = await destinoUnico(a.alvo);
      const r = await ordem(para.endsWith("@g.us") ? "grupo_info" : "perfil_contato", { jid: para }, para, ctx.profileId);
      return { conversa: nomeChat(chat, para), ...r };
    },
  },
  {
    name: "whatsapp_gerenciar_grupo",
    soAdmin: true,
    kind: "atencao",
    label: "Mexeu no grupo do WhatsApp",
    description:
      "Gerencia um grupo: acao=participantes (operacao add|remove|promote|demote + pessoas), assunto (novo nome em texto), descricao (texto), so_admins_enviam (valor true/false), so_admins_editam (valor true/false), novo_link (gera link de convite novo).",
    parameters: obj(
      {
        grupo: ALVO,
        acao: { type: "string", enum: ["participantes", "assunto", "descricao", "so_admins_enviam", "so_admins_editam", "novo_link"] },
        operacao: { type: "string", enum: ["add", "remove", "promote", "demote"] },
        pessoas: { type: "array", items: { type: "string" }, description: "nomes de contatos ou telefones" },
        texto: { type: "string" },
        valor: { type: "boolean" },
      },
      ["grupo", "acao"]
    ),
    descrever: async (a) => {
      const g = await grupoUnico(a.grupo);
      const OP: Record<string, string> = { add: "Adicionar", remove: "Remover", promote: "Tornar admin", demote: "Tirar admin" };
      const o = String(a.acao);
      const oque =
        o === "participantes" ? `${OP[String(a.operacao)] ?? "?"}: ${((a.pessoas as string[]) ?? []).join(", ")}`
        : o === "assunto" ? `Novo nome: “${a.texto}”`
        : o === "descricao" ? `Nova descrição: “${curto(String(a.texto ?? ""), 300)}”`
        : o === "novo_link" ? "Gerar link de convite novo (o antigo para de funcionar)"
        : `${o === "so_admins_enviam" ? "Só admins enviam" : "Só admins editam os dados"}: ${a.valor ? "sim" : "não"}`;
      return `Grupo ${nomeChat(g.chat, g.para)}\n${oque}`;
    },
    run: async (a, ctx) => {
      const g = await grupoUnico(a.grupo);
      const o = String(a.acao);
      let payload: Record<string, unknown>;
      if (o === "participantes") {
        if (!["add", "remove", "promote", "demote"].includes(String(a.operacao))) throw new Error("Diga a operação: add, remove, promote ou demote.");
        payload = { jid: g.para, acao: "participantes", operacao: String(a.operacao), participantes: await jidsDePessoas(a.pessoas) };
      } else if (o === "assunto" || o === "descricao") {
        if (!String(a.texto ?? "").trim()) throw new Error("Falta o texto.");
        payload = { jid: g.para, acao: o, texto: String(a.texto).trim() };
      } else if (o === "novo_link") payload = { jid: g.para, acao: "convite_novo" };
      else if (o === "so_admins_enviam") payload = { jid: g.para, acao: "config", valor: a.valor ? "announcement" : "not_announcement" };
      else if (o === "so_admins_editam") payload = { jid: g.para, acao: "config", valor: a.valor ? "locked" : "unlocked" };
      else throw new Error("Ação desconhecida.");
      return { grupo: nomeChat(g.chat, g.para), ...(await ordem("grupo", payload, g.para, ctx.profileId)) };
    },
  },
  {
    name: "whatsapp_criar_grupo",
    soAdmin: true,
    kind: "confirm",
    label: "Criou grupo no WhatsApp",
    description: "Cria um grupo no WhatsApp do escritório com as pessoas informadas (nomes de contatos ou telefones).",
    parameters: obj({ nome: { type: "string" }, pessoas: { type: "array", items: { type: "string" } } }, ["nome", "pessoas"]),
    descrever: async (a) => `Criar o grupo “${a.nome}” com: ${((a.pessoas as string[]) ?? []).join(", ")}`,
    run: async (a, ctx) => {
      const participantes = await jidsDePessoas(a.pessoas);
      return ordem("grupo", { acao: "criar", assunto: String(a.nome).trim().slice(0, 100), participantes }, null, ctx.profileId, 30_000);
    },
  },
  {
    name: "whatsapp_sair_do_grupo",
    soAdmin: true,
    kind: "delete",
    label: "Saiu do grupo do WhatsApp",
    description: "O número do escritório sai de um grupo (encerrar=true: remove todos e sai, só se for admin).",
    parameters: obj({ grupo: ALVO, encerrar: { type: "boolean" } }, ["grupo"]),
    descrever: async (a) => {
      const g = await grupoUnico(a.grupo);
      return `${a.encerrar ? "Encerrar (remover todos e sair)" : "Sair do"} grupo ${nomeChat(g.chat, g.para)}`;
    },
    run: async (a, ctx) => {
      const g = await grupoUnico(a.grupo);
      return ordem("grupo", { jid: g.para, acao: a.encerrar ? "encerrar" : "sair" }, g.para, ctx.profileId, 30_000);
    },
  },
  // ───────── leitura 24h para a Distribuição ─────────
  {
    name: "whatsapp_ler_para_distribuicao",
    soAdmin: true,
    kind: "write",
    label: "Mudou a leitura 24h do WhatsApp",
    description:
      "Liga (ler=true) ou desliga (ler=false) a leitura 24h de um grupo ou contato para gerar demandas na Distribuição — vale mesmo para conversa SEM cliente vinculado. Use quando pedirem 'quero que a leitura/geração de demandas fique nesse grupo/contato'.",
    parameters: obj({ alvo: ALVO, ler: { type: "boolean" } }, ["alvo", "ler"]),
    run: async (a) => {
      const { para, chat } = await destinoUnico(a.alvo);
      if (!chat) throw new Error("Essa conversa ainda não existe no WhatsApp do escritório (precisa ter pelo menos uma mensagem).");
      const automatico = !!chat.client_id || (chat.is_group && /assessoria\s+juridica/.test((chat.nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()));
      const ler = a.ler !== false;
      const valor = ler === automatico ? null : ler; // igual ao padrão: volta para automático
      const { error } = await db().from("wa_chats").update({ ler_demandas: valor }).eq("chat_jid", para);
      if (error) throw error;
      return { conversa: nomeChat(chat, para), lendo: ler, observacao: ler ? "Mensagens novas viram sugestões na Distribuição (a partir das últimas 24h)." : "Não gera mais demandas." };
    },
  },
  {
    name: "whatsapp_conversas_lidas",
    soAdmin: true,
    kind: "read",
    label: "Viu quais conversas a Distribuição lê",
    description: "Lista os grupos e contatos que a leitura 24h da Distribuição está lendo (e os desligados a pedido), com o motivo.",
    parameters: obj({}),
    run: async () => {
      const { data, error } = await db()
        .from("wa_chats")
        .select("chat_jid, nome, is_group, client_id, ler_demandas, clients(name)")
        .or("client_id.not.is.null,and(is_group.eq.true,nome.ilike.*assessoria*jur*dica*),ler_demandas.not.is.null")
        .eq("arquivado", false)
        .limit(300);
      if (error) throw error;
      const lendo: string[] = [];
      const desligadas: string[] = [];
      for (const c of data ?? []) {
        const cli = (c.clients as unknown as { name: string } | null)?.name;
        const nome = `${nomeChat(c, c.chat_jid)}${c.is_group ? " [grupo]" : ""}`;
        if (c.ler_demandas === false) desligadas.push(nome);
        else lendo.push(`${nome} — ${c.ler_demandas ? "ligada a dedo" : cli ? `cliente ${cli}` : "grupo de Assessoria Jurídica"}`);
      }
      return { lendo, desligadas };
    },
  },
];
