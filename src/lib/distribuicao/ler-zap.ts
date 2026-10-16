import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { getEscritorioConfig, listPessoas, sugerirResponsavel } from "@/lib/data/escritorio";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import { criarAvisos } from "@/lib/avisos";

// Lê as mensagens novas das conversas do WhatsApp ligadas a clientes e pede à
// IA só os PEDIDOS de trabalho. Cada pedido vira um cartão na Distribuição,
// com área e responsável sugeridos. Nada é criado como atividade sozinho.

const MAX_MSGS = 80; // por conversa e por leitura
const PRIMEIRA_JANELA_H = 24; // conversa nunca lida: só as últimas 24h

type Msg = { wa_timestamp: string; from_me: boolean; texto: string | null; tipo: string; media_nome: string | null; sender_jid: string | null; raw: unknown };

type DemandaIA = {
  titulo: string;
  descricao: string;
  area: string | null;
  tipo: string;
  prioridade: "baixa" | "media" | "alta";
  prazo: string | null;
  mensagens: number[];
};

const SCHEMA = {
  type: "object",
  properties: {
    demandas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          descricao: { type: "string" },
          area: { type: ["string", "null"] },
          tipo: { type: "string", enum: [...ACTIVITY_TYPES] },
          prioridade: { type: "string", enum: ["baixa", "media", "alta"] },
          prazo: { type: ["string", "null"], description: "AAAA-MM-DD, só se o cliente disse a data" },
          mensagens: { type: "array", items: { type: "integer" } },
        },
        required: ["titulo", "descricao", "area", "tipo", "prioridade", "prazo", "mensagens"],
      },
    },
  },
  required: ["demandas"],
};

function autor(m: Msg): string {
  if (m.from_me) return "Escritório";
  const push = (m.raw as { pushName?: string } | null)?.pushName;
  return push || (m.sender_jid ? `+${m.sender_jid.split("@")[0]}` : "Cliente");
}

function conteudo(m: Msg): string {
  if (m.texto?.trim()) return m.texto.trim();
  if (m.tipo === "documento") return `[enviou o documento ${m.media_nome ?? ""}]`.trim();
  if (m.tipo === "imagem") return "[enviou uma imagem]";
  if (m.tipo === "audio") return "[enviou um áudio]";
  return "";
}

export type ResultadoLeitura = { conversas: number; mensagens: number; sugestoes: number; erro?: string };

export async function lerConversasDoZap(): Promise<ResultadoLeitura> {
  const db = createAdminClient();
  const [config, pessoas] = await Promise.all([getEscritorioConfig(), listPessoas()]);
  const { data: chats } = await db
    .from("wa_chats")
    .select("chat_jid, nome, is_group, client_id, demandas_lidas_ate, ultima_msg_em, clients(name)")
    .not("client_id", "is", null)
    .eq("arquivado", false);

  const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const r: ResultadoLeitura = { conversas: 0, mensagens: 0, sugestoes: 0 };

  for (const chat of chats ?? []) {
    const desde = chat.demandas_lidas_ate ?? new Date(Date.now() - PRIMEIRA_JANELA_H * 3_600_000).toISOString();
    if (chat.ultima_msg_em && chat.ultima_msg_em <= desde) continue;

    const { data: msgs } = await db
      .from("wa_messages")
      .select("wa_timestamp, from_me, texto, tipo, media_nome, sender_jid, raw")
      .eq("chat_jid", chat.chat_jid)
      .gt("wa_timestamp", desde)
      .order("wa_timestamp", { ascending: false })
      .limit(MAX_MSGS);
    const novas = ((msgs ?? []) as Msg[]).reverse().filter((m) => conteudo(m));
    const ultima = msgs?.[0]?.wa_timestamp;
    if (!novas.some((m) => !m.from_me)) {
      if (ultima) await db.from("wa_chats").update({ demandas_lidas_ate: ultima }).eq("chat_jid", chat.chat_jid);
      continue;
    }

    // o que já está esperando na Distribuição para este cliente (não repetir)
    const { data: pendentes } = await db
      .from("distribuicao")
      .select("titulo")
      .eq("client_id", chat.client_id!)
      .eq("status", "pendente")
      .limit(30);

    const cliente = (chat.clients as unknown as { name: string } | null)?.name ?? chat.nome ?? "cliente";
    const linhas = novas.map((m, i) => {
      const quando = new Date(m.wa_timestamp).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      return `[${i}] ${quando} · ${autor(m)}: ${conteudo(m)}`;
    });

    const ia = await generateJson<{ demandas: DemandaIA[] }>({
      model: MODELOS.distribuicao,
      schema: SCHEMA,
      system: [
        "Você faz a triagem do WhatsApp do escritório MC Advogados (advocacia empresarial).",
        `Hoje é ${hojeISO}. As mensagens abaixo são da conversa ${chat.is_group ? "do grupo" : "com o contato"} do cliente "${cliente}".`,
        "Encontre só PEDIDOS DE TRABALHO para o escritório: o cliente pede algo (analisar, elaborar, revisar, registrar, responder, agendar), manda documento para análise, faz pergunta jurídica que exige estudo, informa prazo, notificação, audiência ou problema que precisa de providência.",
        "Ignore cumprimentos, agradecimentos, confirmações, conversa social, pedidos que o próprio escritório já respondeu como resolvidos na conversa e mensagens do escritório (\"Escritório\").",
        "Junte em UMA demanda as mensagens sobre o mesmo assunto. Se não houver pedido, devolva lista vazia.",
        `Já registradas e pendentes (NÃO repita): ${(pendentes ?? []).map((p) => `"${p.titulo}"`).join(", ") || "nenhuma"}.`,
        `Área: escolha uma destas ou null: ${config.areas.join(", ")}.`,
        "titulo: curto, começando com verbo no infinitivo (ex.: \"Revisar contrato de locação da filial\"). descricao: o que o cliente pediu, com os detalhes úteis, em 1 a 4 frases. prazo: só se o cliente citou data ou prazo. mensagens: índices [n] que originaram a demanda.",
      ].join("\n"),
      parts: [{ text: linhas.join("\n") }],
    });

    r.conversas++;
    r.mensagens += novas.length;
    if (!ia.ok) {
      r.erro = ia.error;
      break; // não avança o cursor: tenta de novo na próxima leitura
    }

    const linhasNovas = [];
    for (const d of ia.data.demandas ?? []) {
      if (!d.titulo?.trim()) continue;
      const area = d.area && config.areas.find((a) => a.toLowerCase() === d.area!.toLowerCase()) ? config.areas.find((a) => a.toLowerCase() === d.area!.toLowerCase())! : null;
      const trechos = (d.mensagens ?? [])
        .filter((i) => novas[i])
        .slice(0, 8)
        .map((i) => ({ texto: conteudo(novas[i]).slice(0, 600), quem: autor(novas[i]), em: novas[i].wa_timestamp }));
      linhasNovas.push({
        origem: "whatsapp",
        client_id: chat.client_id,
        chat_jid: chat.chat_jid,
        titulo: d.titulo.trim().slice(0, 200),
        descricao: d.descricao?.trim() || null,
        area,
        prioridade: ["baixa", "media", "alta"].includes(d.prioridade) ? d.prioridade : "media",
        prazo_sugerido: d.prazo && /^\d{4}-\d{2}-\d{2}$/.test(d.prazo) && d.prazo >= hojeISO ? d.prazo : null,
        responsavel_sugerido: await sugerirResponsavel(area, pessoas),
        tipo: ACTIVITY_TYPES.includes(d.tipo as never) ? d.tipo : null,
        trechos: trechos as unknown as never,
      });
    }
    if (linhasNovas.length) {
      const { error } = await db.from("distribuicao").insert(linhasNovas);
      if (error) {
        r.erro = error.message;
        break;
      }
      r.sugestoes += linhasNovas.length;
    }
    if (ultima) await db.from("wa_chats").update({ demandas_lidas_ate: ultima }).eq("chat_jid", chat.chat_jid);
  }

  // aviso para quem pode distribuir (admins), sem travar a leitura
  if (r.sugestoes) {
    const { data: admins } = await db.from("profiles").select("id").eq("role", "admin").eq("ativo", true).eq("oculto", false);
    await criarAvisos(
      (admins ?? []).map((a) => ({
        profile_id: a.id,
        tipo: "distribuicao",
        titulo: `${r.sugestoes} demanda(s) nova(s) do WhatsApp`,
        corpo: "A IA leu os grupos dos clientes e separou pedidos para distribuir.",
        url: "/admin/distribuicao",
      }))
    ).catch(() => undefined);
  }
  return r;
}
