import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { getEscritorioConfig, listPessoas, sugerirResponsavel } from "@/lib/data/escritorio";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import { criarAvisos } from "@/lib/avisos";
import { transcreverAudioDoZap } from "@/lib/whatsapp-audio";
import { ligarGruposDeAssessoria } from "@/lib/zap/ligar-grupos";
import { chaveFone, jidsDoFone } from "@/lib/painel/equipe-zap";

// Lê as mensagens novas das conversas do WhatsApp ligadas a clientes, de todo
// grupo com "ASSESSORIA JURÍDICA" no nome e das conversas ligadas a dedo
// (wa_chats.ler_demandas = true, mesmo sem cliente; false desliga) e
// pede à IA só os PEDIDOS de trabalho. Cada pedido vira um cartão na Distribuição,
// com área e responsável sugeridos. Nada é criado como atividade sozinho.
//
// Suporte (10/11/2026): na conversa do número do escritório com quem é do
// Suporte (profiles.suporte; o telefone vem de Responsáveis), a leitura é ao
// contrário: os PEDIDOS são as mensagens que o escritório manda para ele, e o
// cartão já sai com ele como responsável sugerido.
//
// Grupo de sistemas (18/11/2026): no grupo "Sistemas e IA" o Maurício (e quem mais
// da equipe) pede coisas ao Suporte. Ali o pedido NÃO passa pela Distribuição: vira
// atividade direto, com o Suporte como responsável, e o cartão fica como "aceita"
// só para guardar de onde veio e não repetir.
const GRUPO_SISTEMAS = /sistemas?\s+e\s+i\.?a\b/i;

const MAX_MSGS = 80; // por conversa e por leitura
const PRIMEIRA_JANELA_H = 24; // conversa nunca lida: só as últimas 24h
const MAX_AUDIOS = 15; // áudios transcritos por conversa e por leitura

type Msg = {
  wa_timestamp: string;
  from_me: boolean;
  texto: string | null;
  tipo: string;
  media_nome: string | null;
  media_path: string | null;
  media_mime: string | null;
  sender_jid: string | null;
  sender_nome?: string | null;
  /** "ia" = mensagem automática do portal; "humano" = alguém digitou */
  quem?: string | null;
  raw: unknown;
  /** preenchido aqui: o que foi dito no áudio */
  transcricao?: string | null;
};

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

// avisos automáticos do portal que saem do número do escritório (atas, códigos,
// relatórios, bom dia da rotina): nunca são pedido para o Suporte
const AUTOMATICA = /^\*MC Advogados\*|Seu código para assinar|^(Bom dia|Boa tarde|Boa noite)[^\n]{0,80}(Passando|Como vai)|segue (em anexo )?o relatório mensal/i;

/** Conversas (chat_jid) dos números do Suporte → id do responsável dele. */
type Suporte = { resp: string; nome: string; perfil: string };
async function conversasDoSuporte(db: ReturnType<typeof createAdminClient>): Promise<Map<string, Suporte>> {
  const m = new Map<string, Suporte>();
  const { data: sup } = await (db as unknown as SupabaseClient).from("profiles").select("id").eq("suporte", true).eq("ativo", true);
  const ids = ((sup ?? []) as { id: string }[]).map((x) => x.id);
  if (!ids.length) return m;
  const { data: resps } = await db.from("responsaveis").select("id, nome, telefone, profile_id").in("profile_id", ids);
  for (const r of resps ?? []) if (chaveFone(r.telefone)) for (const j of jidsDoFone(r.telefone)) m.set(j, { resp: r.id, nome: r.nome, perfil: r.profile_id! });
  return m;
}

function autor(m: Msg): string {
  if (m.from_me) return "Escritório";
  const push = (m.raw as { pushName?: string } | null)?.pushName;
  return push || m.sender_nome || (m.sender_jid ? `+${m.sender_jid.split("@")[0]}` : "Cliente");
}

function conteudo(m: Msg): string {
  if (m.texto?.trim()) return m.texto.trim();
  if (m.tipo === "documento") return `[enviou o documento ${m.media_nome ?? ""}]`.trim();
  if (m.tipo === "imagem") return "[enviou uma imagem]";
  if (m.tipo === "audio") return m.transcricao ? `[áudio] ${m.transcricao}` : "[enviou um áudio]";
  return "";
}

const chave = (iso: string) => String(Math.floor(Date.parse(iso) / 1000));

export type ResultadoLeitura = { conversas: number; mensagens: number; sugestoes: number; erro?: string; ocupada?: true };

// Trava (04/11/2026): o Agente da VPS chama a leitura a cada conversa, o GitHub de
// hora em hora e a Vercel às 21h. Duas leituras juntas pegavam as mesmas mensagens
// e pagavam a IA (e a transcrição dos áudios) duas vezes. Quem chega com a leitura
// em andamento só deixa "pendente" e a leitura em curso roda mais uma vez no fim.
const TRAVA = "trava:distribuicao";
const TRAVA_VENCE_MS = 6 * 60_000; // função caiu no meio: a trava vence sozinha

async function pegarTrava(db: SupabaseClient): Promise<boolean> {
  const agora = new Date().toISOString();
  const { error } = await db.from("painel_gerente").insert({ chave: TRAVA, conteudo: { pendente: false }, created_at: agora });
  if (!error) return true;
  const { data } = await db.from("painel_gerente").select("created_at").eq("chave", TRAVA).maybeSingle();
  if (data && Date.now() - Date.parse(data.created_at as string) > TRAVA_VENCE_MS) {
    // vencida: assume só se ninguém renovou no meio-tempo
    const { data: peguei } = await db.from("painel_gerente").update({ conteudo: { pendente: false }, created_at: agora }).eq("chave", TRAVA).eq("created_at", data.created_at as string).select("chave");
    return !!peguei?.length;
  }
  await db.from("painel_gerente").update({ conteudo: { pendente: true } }).eq("chave", TRAVA);
  return false;
}

export async function lerConversasDoZap(): Promise<ResultadoLeitura> {
  const db = createAdminClient();
  const trava = db as unknown as SupabaseClient; // painel_gerente não está nos tipos gerados
  if (!(await pegarTrava(trava))) return { conversas: 0, mensagens: 0, sugestoes: 0, ocupada: true };
  const total: ResultadoLeitura = { conversas: 0, mensagens: 0, sugestoes: 0 };
  try {
    for (let volta = 0; volta < 3; volta++) {
      const r = await lerUmaVez(db);
      total.conversas += r.conversas;
      total.mensagens += r.mensagens;
      total.sugestoes += r.sugestoes;
      if (r.erro) total.erro = r.erro;
      // chegou pedido de leitura enquanto lia? lê de novo (só o que é novo)
      const { data } = await trava.from("painel_gerente").select("conteudo").eq("chave", TRAVA).maybeSingle();
      if (r.erro || !(data?.conteudo as { pendente?: boolean } | null)?.pendente) break;
      await trava.from("painel_gerente").update({ conteudo: { pendente: false } }).eq("chave", TRAVA);
    }
  } finally {
    await trava.from("painel_gerente").delete().eq("chave", TRAVA);
  }
  return total;
}

async function lerUmaVez(db: ReturnType<typeof createAdminClient>): Promise<ResultadoLeitura> {
  // grupo "Assessoria Jurídica - X" sem cliente: liga à ficha antes de ler (a demanda já nasce com cliente)
  await ligarGruposDeAssessoria(db).catch(() => undefined);
  const [config, pessoas, suporte] = await Promise.all([getEscritorioConfig(), listPessoas(), conversasDoSuporte(db)]);
  const doSuporte = [...suporte.keys()].map((j) => `chat_jid.eq.${j}`).join(",");
  const { data: chats } = await db
    .from("wa_chats")
    .select("chat_jid, nome, is_group, client_id, demandas_lidas_ate, ultima_msg_em, ler_demandas, clients(name)")
    // "jur*dica" pega com e sem acento; ler_demandas=true: escolhida a dedo (mesmo sem cliente)
    .or(`client_id.not.is.null,and(is_group.eq.true,nome.ilike.*assessoria*jur*dica*),ler_demandas.is.true${doSuporte ? `,${doSuporte}` : ""}`)
    .eq("arquivado", false);

  const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const r: ResultadoLeitura = { conversas: 0, mensagens: 0, sugestoes: 0 };
  const idsNovos: string[] = [];

  for (const chat of chats ?? []) {
    if (chat.ler_demandas === false) continue; // desligada a pedido
    // grupo de sistemas: pedidos de qualquer um para o Suporte (vira atividade direto)
    const grupoSistemas = !!chat.is_group && GRUPO_SISTEMAS.test(chat.nome ?? "") && suporte.size > 0;
    const sup = grupoSistemas ? [...suporte.values()][0] : !chat.is_group ? suporte.get(chat.chat_jid) : undefined;
    const doSuporte = (m: Msg) => !!m.sender_jid && suporte.has(m.sender_jid);
    // quem faz o pedido: o cliente (normal), o escritório (conversa do Suporte) ou
    // qualquer um menos o próprio Suporte (grupo de sistemas)
    const ehPedido = (m: Msg) =>
      grupoSistemas
        ? !doSuporte(m) && m.quem !== "ia" && !(m.from_me && AUTOMATICA.test(m.texto ?? ""))
        : sup
          ? m.from_me && m.quem !== "ia" && !AUTOMATICA.test(m.texto ?? "")
          : !m.from_me;
    const desde = chat.demandas_lidas_ate ?? new Date(Date.now() - PRIMEIRA_JANELA_H * 3_600_000).toISOString();
    if (chat.ultima_msg_em && chat.ultima_msg_em <= desde) continue;

    const { data: msgs } = await db
      .from("wa_messages")
      .select("wa_timestamp, from_me, texto, tipo, media_nome, media_path, media_mime, sender_jid, sender_nome, quem, raw")
      .eq("chat_jid", chat.chat_jid)
      .gt("wa_timestamp", desde)
      .order("wa_timestamp", { ascending: false })
      .limit(MAX_MSGS);
    // trava contra repetição: mensagem que já gerou sugestão (em qualquer
    // situação) não volta para a IA, mesmo que o marcador de leitura se perca
    const { data: jaFeitas } = await db
      .from("distribuicao")
      .select("titulo, trechos")
      .eq("chat_jid", chat.chat_jid)
      .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
      .limit(200);
    const usadas = new Set<string>();
    for (const d of jaFeitas ?? []) for (const tr of (Array.isArray(d.trechos) ? d.trechos : []) as { em?: string }[]) if (tr.em) usadas.add(chave(tr.em));
    const lidas = ((msgs ?? []) as Msg[]).reverse().filter((m) => !ehPedido(m) || !usadas.has(chave(m.wa_timestamp)));
    // áudio de quem pede: a IA ouve (transcreve) antes de procurar pedidos
    const audios = lidas.filter((m) => m.tipo === "audio" && ehPedido(m) && m.media_path).slice(-MAX_AUDIOS);
    for (let i = 0; i < audios.length; i += 3) {
      await Promise.all(
        audios.slice(i, i + 3).map(async (m) => {
          m.transcricao = await transcreverAudioDoZap(m.media_path, m.media_mime);
        })
      );
    }
    const novas = lidas.filter((m) => conteudo(m));
    const ultima = msgs?.[0]?.wa_timestamp;
    if (!novas.some(ehPedido)) {
      if (ultima) await db.from("wa_chats").update({ demandas_lidas_ate: ultima }).eq("chat_jid", chat.chat_jid);
      continue;
    }

    // o que já está esperando na Distribuição para este cliente (não repetir)
    let qPendentes = db.from("distribuicao").select("titulo").gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString()).limit(40);
    qPendentes = chat.client_id ? qPendentes.eq("client_id", chat.client_id) : qPendentes.eq("chat_jid", chat.chat_jid);
    const { data: pendentes } = await qPendentes;

    const cliente = (chat.clients as unknown as { name: string } | null)?.name ?? chat.nome ?? "cliente";
    const linhas = novas.map((m, i) => {
      const quando = new Date(m.wa_timestamp).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const quem = grupoSistemas ? (doSuporte(m) ? sup!.nome : autor(m)) : sup && !m.from_me ? sup.nome : autor(m);
      return `[${i}] ${quando} · ${quem}: ${conteudo(m)}`;
    });

    const instrucoes = grupoSistemas
      ? [
          "Você faz a triagem do WhatsApp do escritório MC Advogados (advocacia empresarial).",
          `Hoje é ${hojeISO}. As mensagens abaixo são do grupo interno "${chat.nome}", onde o sócio (Maurício) e a equipe pedem coisas a ${sup!.nome}, que cuida do portal do escritório, sistemas, automações, IA, site e tecnologia.`,
          "Mensagens marcadas [áudio] são a transcrição do que a pessoa falou num áudio: trate como se ela tivesse escrito. Imagem com legenda costuma ser print da tela com problema: use a legenda e o contexto.",
          `Encontre só PEDIDOS DE TRABALHO para ${sup!.nome}: pedir para fazer, criar, ajustar, corrigir, melhorar, verificar ou resolver algo, ou relatar erro/problema no sistema ("não estou conseguindo…", "não está indo", print de erro). Erro relatado é pedido para resolver.`,
          `Ignore cumprimentos, avisos, conversa sem pedido e o que ${sup!.nome} já respondeu como feito. As mensagens de ${sup!.nome} servem só de contexto.`,
          "Junte em UMA demanda as mensagens sobre o mesmo assunto. Se não houver pedido, devolva lista vazia.",
          `Já registradas nos últimos dias (NÃO repita nem reescreva com outras palavras): ${(pendentes ?? []).map((p) => `"${p.titulo}"`).join(", ") || "nenhuma"}.`,
          'Área: use null. tipo: use "consultoria".',
          'titulo: curto, começando com verbo no infinitivo, dizendo o que resolver ou fazer (ex.: "Resolver problema na exclusão de demandas", "Adicionar período personalizado ao ranking"). descricao: quem pediu e o que pediu, com os detalhes úteis, em 1 a 4 frases. prazo: só se citaram data ou prazo. mensagens: índices [n] que originaram a demanda.',
        ]
      : sup
      ? [
          "Você faz a triagem do WhatsApp do escritório MC Advogados (advocacia empresarial).",
          `Hoje é ${hojeISO}. As mensagens abaixo são da conversa do escritório com ${sup.nome}, do Suporte (cuida do portal, sistemas, site, marketing e tecnologia do escritório).`,
          "Mensagens marcadas [áudio] são a transcrição do que a pessoa falou num áudio: trate como se ela tivesse escrito.",
          `Encontre só PEDIDOS DE TRABALHO que o escritório ("Escritório") faz para ${sup.nome}: pedir para fazer, ajustar, corrigir, criar, enviar, verificar ou resolver algo, ou mandar arquivo/link pedindo alguma providência.`,
          `Ignore avisos automáticos (atas, códigos, relatórios de cliente, bom dia), cumprimentos, links ou arquivos sem pedido, e o que ${sup.nome} já respondeu como feito na conversa. As mensagens de ${sup.nome} servem só de contexto.`,
          "Junte em UMA demanda as mensagens sobre o mesmo assunto. Se não houver pedido, devolva lista vazia.",
          `Já registradas nos últimos dias (NÃO repita nem reescreva com outras palavras): ${(pendentes ?? []).map((p) => `"${p.titulo}"`).join(", ") || "nenhuma"}.`,
          "Área: use null.",
          "titulo: curto, começando com verbo no infinitivo (ex.: \"Ajustar formulário de registro de marca\"). descricao: o que foi pedido, com os detalhes úteis, em 1 a 4 frases. prazo: só se citaram data ou prazo. mensagens: índices [n] que originaram a demanda.",
        ]
      : null;

    const ia = await generateJson<{ demandas: DemandaIA[] }>({
      model: MODELOS.distribuicao, funcao: "distribuicao",
      schema: SCHEMA,
      system: (instrucoes ?? [
        "Você faz a triagem do WhatsApp do escritório MC Advogados (advocacia empresarial).",
        `Hoje é ${hojeISO}. As mensagens abaixo são da conversa ${chat.is_group ? "do grupo" : "com o contato"} do cliente "${cliente}".`,
        "Mensagens marcadas [áudio] são a transcrição do que a pessoa falou num áudio: trate como se ela tivesse escrito.",
        "Encontre só PEDIDOS DE TRABALHO para o escritório: o cliente pede algo (analisar, elaborar, revisar, registrar, responder, agendar), manda documento para análise, faz pergunta jurídica que exige estudo, informa prazo, notificação, audiência ou problema que precisa de providência.",
        "Ignore cumprimentos, agradecimentos, confirmações, conversa social, pedidos que o próprio escritório já respondeu como resolvidos na conversa e mensagens do escritório (\"Escritório\").",
        "Junte em UMA demanda as mensagens sobre o mesmo assunto. Se não houver pedido, devolva lista vazia.",
        `Já registradas nos últimos dias (NÃO repita nem reescreva com outras palavras): ${(pendentes ?? []).map((p) => `"${p.titulo}"`).join(", ") || "nenhuma"}.`,
        `Área: escolha uma destas ou null: ${config.areas.join(", ")}.`,
        "titulo: curto, começando com verbo no infinitivo (ex.: \"Revisar contrato de locação da filial\"). descricao: o que o cliente pediu, com os detalhes úteis, em 1 a 4 frases. prazo: só se o cliente citou data ou prazo. mensagens: índices [n] que originaram a demanda.",
      ]).join("\n"),
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
      const doCliente = trechos.filter((tr) => {
        const m = novas.find((x) => x.wa_timestamp === tr.em);
        return !!m && ehPedido(m);
      });
      if (doCliente.some((tr) => usadas.has(chave(tr.em)))) continue;
      doCliente.forEach((tr) => usadas.add(chave(tr.em)));
      if (grupoSistemas) {
        // vira atividade direto, sem Distribuição
        const prazo = d.prazo && /^\d{4}-\d{2}-\d{2}$/.test(d.prazo) && d.prazo >= hojeISO ? d.prazo : null;
        const { data: criada, error: eAt } = await db
          .from("activities")
          .insert({
            title: d.titulo.trim().slice(0, 200),
            description: [d.descricao?.trim(), `Pedido no grupo ${chat.nome} do WhatsApp.`].filter(Boolean).join("\n\n"),
            area: null,
            type: "consultoria",
            deadline: prazo,
            categoria: "tarefa",
            responsavel_id: sup!.resp,
            responsible_id: sup!.perfil,
            client_id: null,
          })
          .select("id")
          .single();
        if (eAt || !criada) {
          r.erro = eAt?.message ?? "não criou a atividade";
          break;
        }
        linhasNovas.push({
          origem: "whatsapp",
          client_id: null,
          chat_jid: chat.chat_jid,
          titulo: d.titulo.trim().slice(0, 200),
          descricao: d.descricao?.trim() || null,
          area: null,
          prioridade: ["baixa", "media", "alta"].includes(d.prioridade) ? d.prioridade : "media",
          prazo_sugerido: prazo,
          responsavel_sugerido: sup!.resp,
          tipo: "consultoria",
          trechos: trechos as unknown as never,
          status: "aceita",
          activity_id: criada.id,
          tratado_em: new Date().toISOString(),
        });
        continue;
      }
      linhasNovas.push({
        origem: "whatsapp",
        client_id: chat.client_id,
        chat_jid: chat.chat_jid,
        titulo: d.titulo.trim().slice(0, 200),
        descricao: d.descricao?.trim() || null,
        area,
        prioridade: ["baixa", "media", "alta"].includes(d.prioridade) ? d.prioridade : "media",
        prazo_sugerido: d.prazo && /^\d{4}-\d{2}-\d{2}$/.test(d.prazo) && d.prazo >= hojeISO ? d.prazo : null,
        responsavel_sugerido: sup ? sup.resp : await sugerirResponsavel(area, pessoas, chat.client_id),
        tipo: ACTIVITY_TYPES.includes(d.tipo as never) ? d.tipo : null,
        trechos: trechos as unknown as never,
      });
    }
    if (linhasNovas.length) {
      const { data: criadas, error } = await db.from("distribuicao").insert(linhasNovas).select("id");
      if (!grupoSistemas) for (const c of criadas ?? []) idsNovos.push(c.id);
      if (error) {
        r.erro = error.message;
        break;
      }
      if (!grupoSistemas) r.sugestoes += linhasNovas.length;
    }
    if (ultima) await db.from("wa_chats").update({ demandas_lidas_ate: ultima }).eq("chat_jid", chat.chat_jid);
  }

  // grupo de sistemas: o aviso "Você é o responsável" sai sozinho ao criar a atividade

  // aviso para quem pode distribuir (admins), sem travar a leitura
  if (r.sugestoes) {
    const { data: admins } = await db.from("profiles").select("id").eq("role", "admin").eq("ativo", true).eq("oculto", false);
    await criarAvisos(
      (admins ?? []).map((a) => ({
        profile_id: a.id,
        tipo: "distribuicao",
        titulo: `${r.sugestoes} demanda(s) nova(s) do WhatsApp`,
        corpo: "A IA leu os grupos dos clientes e separou pedidos para distribuir.",
        // um pedido só: abre já no cartão dele
        url: idsNovos.length === 1 ? `/admin/distribuicao#d-${idsNovos[0]}` : "/admin/distribuicao",
      }))
    ).catch(() => undefined);
  }
  return r;
}
