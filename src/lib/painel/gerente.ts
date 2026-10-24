import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { calcularMetricas, tudo } from "./metricas";
import { equipeNoZap } from "./equipe-zap";
import { carregarBase } from "./dados";
import { DIA, aberta, atrasada, dataBahia, dentro, dias, hojeBahia, pesoAtividade, periodoDe, somaDias, TIPOS, type LinhaAtividade } from "./base";

// O "gerente" do Painel do Dono (24/10/2026): passa o resumo do período pro
// dono e sugere o que fazer. Os cruzamentos (cliente perguntando + andamento
// novo, audiência amanhã com agenda cheia, prazo sem ninguém mexer, carga de
// cada um…) são feitos AQUI, em código. A IA (Flash-Lite, ~2 mil tokens) só
// escreve o texto e escolhe as sugestões entre os itens já calculados.
// Cache em painel_gerente: cada período 1x; os que terminam "agora" valem 1 h.

const db = () => createAdminClient() as unknown as SupabaseClient;
const VALIDADE_MS = 60 * 60 * 1000;
const MAURICIO = "ee479af5-6a30-4741-880a-c9e96ea0079b"; // perfil do Maurício (recebe o resumo das 7h)

export type AcaoGerente =
  | { tipo: "abrir"; href: string; rotulo: string }
  | { tipo: "reatribuir"; activityId: string; paraId: string; paraNome: string; rotulo: string };
export type ItemGerente = { id: string; tipo: string; texto: string; acoes: AcaoGerente[] };
export type SugestaoGerente = { texto: string; prioridade: "alta" | "media" | "baixa"; acoes: AcaoGerente[] };
export type Gerente = { resumo: string[]; sugestoes: SugestaoGerente[]; geradoEm: string; periodo: string };

const limpar = (t: string) => t.replace(/^\s*N[°º]\s*\d+\s*/i, "").split(/\n/)[0].replace(/\s+/g, " ").trim().slice(0, 90);
const linkAtividade = (id: string) => `/admin/activities/${id}`;
const nomeCurto = (n: string) => n.replace(/^(Dra?\.)\s+/i, "$1 ").split(" ").slice(0, 2).join(" ");

/** Fatos + itens acionáveis, tudo calculado em código. */
export async function fatosDoGerente(periodoId: string) {
  const p = periodoDe(periodoId);
  const hoje = hojeBahia();
  const amanha = somaDias(hoje, 1);
  const agora = new Date().toISOString();
  const [m, base] = await Promise.all([calcularMetricas(p), carregarBase()]);
  const cli = new Map(base.clientes.map((c) => [c.id, c]));
  const resp = new Map(base.responsaveis.map((r) => [r.id, r]));
  const nomeCli = (id: string | null) => (id ? cli.get(id)?.nome ?? "?" : "sem cliente");
  const nomeResp = (id: string | null) => (id ? nomeCurto(resp.get(id)?.nome ?? "?") : "sem responsável");
  const ats = base.atividades;
  const itens: ItemGerente[] = [];

  /* resumo do período */
  const novas = ats.filter((a) => dentro(a.criada, p.ini, p.fim));
  const concl = ats.filter((a) => a.status === "concluida" && dentro(a.concluida, p.ini, p.fim));
  const porCliente = new Map<string, number>();
  for (const a of novas) if (a.clienteId) porCliente.set(a.clienteId, (porCliente.get(a.clienteId) ?? 0) + 1);
  const conclPorPessoa = new Map<string, LinhaAtividade[]>();
  for (const a of concl) conclPorPessoa.set(a.respId ?? "-", [...(conclPorPessoa.get(a.respId ?? "-") ?? []), a]);
  const atrasadas = ats.filter((a) => atrasada(a, hoje)).sort((a, b) => a.prazo!.localeCompare(b.prazo!));

  /* carga de cada pessoa (estimativa: tipo + prazo + atraso) */
  const equipe = base.responsaveis.filter((r) => r.profileId && m.equipe.some((e) => e.id === r.profileId));
  const carga = equipe
    .map((r) => {
      const minhas = ats.filter((a) => a.respId === r.id && aberta(a));
      return {
        id: r.id,
        nome: nomeCurto(r.nome),
        areas: r.areas,
        carga: Math.round(minhas.reduce((s, a) => s + pesoAtividade(a, hoje), 0) * 10) / 10,
        abertas: minhas.length,
        atrasadas: minhas.filter((a) => atrasada(a, hoje)).length,
        amanha: minhas.filter((a) => a.prazo === amanha).length,
        semana: minhas.filter((a) => a.prazo && a.prazo >= hoje && a.prazo <= somaDias(hoje, 7)).length,
      };
    })
    .sort((a, b) => b.carga - a.carga);
  const mediaCarga = carga.length ? carga.reduce((s, c) => s + c.carga, 0) / carga.length : 0;

  /* 1) cliente perguntando no WhatsApp + andamento/publicação nova do processo dele */
  // conversas e grupos de assessoria; resposta = escritório ou alguém da equipe no grupo
  const [{ data: chats }, membroDaEquipe] = await Promise.all([db().from("wa_chats").select("chat_jid, client_id").not("client_id", "is", null), equipeNoZap()]);
  const chatCli = new Map((chats ?? []).map((c) => [c.chat_jid as string, c.client_id as string]));
  const msgs = chatCli.size
    ? await tudo<{ chat_jid: string; from_me: boolean; wa_timestamp: string; sender_jid: string | null }>((a, b) =>
        db().from("wa_messages").select("chat_jid, from_me, wa_timestamp, sender_jid").in("chat_jid", [...chatCli.keys()]).gte("wa_timestamp", new Date(Date.now() - 30 * DIA).toISOString()).order("wa_timestamp").range(a, b)
      )
    : [];
  const esperando = new Map<string, string>(); // cliente → desde quando espera
  const ultimo = new Map<string, { quando: string; deles: boolean }>();
  const nossa = (x: { from_me: boolean; sender_jid: string | null }) => x.from_me || !!membroDaEquipe(x.sender_jid);
  for (const x of msgs) ultimo.set(x.chat_jid, { quando: x.wa_timestamp, deles: !nossa(x) });
  const primeiraSemResposta = new Map<string, string>();
  for (const x of msgs) {
    if (nossa(x)) primeiraSemResposta.delete(x.chat_jid);
    else if (!primeiraSemResposta.has(x.chat_jid)) primeiraSemResposta.set(x.chat_jid, x.wa_timestamp);
  }
  for (const [jid, desde] of primeiraSemResposta) if (ultimo.get(jid)?.deles) esperando.set(chatCli.get(jid)!, desde);

  const desde7 = new Date(Date.now() - 7 * DIA).toISOString();
  const [{ data: procs }, { data: andNovos }, { data: pubNovas }] = await Promise.all([
    db().from("processes").select("id, client_id, numero_processo, titulo"),
    db().from("andamentos").select("process_id, data, descricao, created_at").gte("created_at", desde7).neq("situacao", "historico").limit(500),
    db().from("publicacoes").select("id, client_id, process_id, numero_processo, status, activity_id, created_at, data_disponibilizacao").gte("created_at", new Date(Date.now() - 15 * DIA).toISOString()).limit(500),
  ]);
  const procPorId = new Map((procs ?? []).map((x) => [x.id as string, x as { id: string; client_id: string | null; numero_processo: string | null; titulo: string | null }]));
  const novidadePorCliente = new Map<string, string>();
  for (const a of andNovos ?? []) {
    const pr = procPorId.get(a.process_id as string);
    if (pr?.client_id && !novidadePorCliente.has(pr.client_id)) novidadePorCliente.set(pr.client_id, `andamento novo no processo ${pr.numero_processo ?? pr.titulo ?? ""}: ${limpar(String(a.descricao ?? ""))}`);
  }
  for (const pb of pubNovas ?? []) {
    const c = (pb.client_id as string | null) ?? (pb.process_id ? procPorId.get(pb.process_id as string)?.client_id : null);
    if (c && !novidadePorCliente.has(c) && (pb.created_at as string) >= desde7) novidadePorCliente.set(c, `publicação nova no processo ${pb.numero_processo ?? ""}`);
  }
  let nCruz = 0;
  let nEspera = 0;
  for (const [c, desde] of [...esperando.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
    const diasEsp = Math.floor((Date.now() - Date.parse(desde)) / DIA);
    const novidade = novidadePorCliente.get(c);
    if (novidade && diasEsp >= 1 && nCruz++ < 6)
      itens.push({ id: `cruz-${c}`, tipo: "cliente_perguntando_com_novidade", texto: `${nomeCli(c)} mandou mensagem no WhatsApp há ${diasEsp} dias sem resposta, e há ${novidade}. Dá para responder já com a novidade.`, acoes: [{ tipo: "abrir", href: "/admin/whatsapp", rotulo: "Abrir WhatsApp" }] });
    else if (!novidade && diasEsp >= 2 && diasEsp <= 10 && nEspera++ < 5)
      itens.push({ id: `espera-${c}`, tipo: "cliente_sem_resposta", texto: `${nomeCli(c)} espera resposta no WhatsApp há ${diasEsp} dias.`, acoes: [{ tipo: "abrir", href: "/admin/whatsapp", rotulo: "Abrir WhatsApp" }] });
  }

  /* 2) audiência amanhã + agenda cheia da pessoa */
  for (const a of ats.filter((x) => aberta(x) && x.categoria === "audiencia" && x.prazo === amanha)) {
    const c = carga.find((x) => x.id === a.respId);
    itens.push({
      id: `aud-${a.id}`,
      tipo: "audiencia_amanha",
      texto: `Amanhã${a.hora ? ` às ${a.hora}` : ""} tem audiência "${a.titulo}" (${nomeCli(a.clienteId)}) com ${nomeResp(a.respId)}${c ? `, que tem mais ${Math.max(0, c.amanha - 1)} coisa(s) vencendo amanhã e ${c.abertas} abertas no total` : ""}. Vale avisar hoje e adiantar o que der.`,
      acoes: [{ tipo: "abrir", href: linkAtividade(a.id), rotulo: "Ver audiência" }],
    });
  }

  /* 3) prazo vencendo hoje/amanhã sem ninguém mexer há 3+ dias */
  for (const a of ats.filter((x) => aberta(x) && x.prazo && x.prazo >= hoje && x.prazo <= amanha && x.categoria !== "audiencia" && dias(x.atualizada, agora) >= 3).slice(0, 6))
    itens.push({ id: `parado-${a.id}`, tipo: "prazo_sem_movimento", texto: `"${a.titulo}" (${nomeCli(a.clienteId)}, ${nomeResp(a.respId)}) vence ${a.prazo === hoje ? "hoje" : "amanhã"} e ninguém mexe nela há ${Math.floor(dias(a.atualizada, agora))} dias.`, acoes: [{ tipo: "abrir", href: linkAtividade(a.id), rotulo: "Abrir atividade" }] });

  /* 4) atrasadas mais antigas */
  for (const a of atrasadas.slice(0, 4))
    itens.push({ id: `atraso-${a.id}`, tipo: "atrasada", texto: `"${a.titulo}" (${nomeCli(a.clienteId)}, ${nomeResp(a.respId)}) está atrasada desde ${a.prazo!.split("-").reverse().join("/")}.`, acoes: [{ tipo: "abrir", href: linkAtividade(a.id), rotulo: "Abrir atividade" }] });

  /* 5) redistribuição: quem está bem acima da média passa o que ainda não começou */
  for (const sob of carga.filter((c) => c.carga > mediaCarga * 1.3 && c.abertas >= 4)) {
    const candidatas = ats.filter((a) => a.respId === sob.id && a.status === "aberta" && a.categoria !== "audiencia").sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
    for (const a of candidatas.slice(0, 2)) {
      const destino = carga.filter((c) => c.id !== sob.id && c.carga < sob.carga * 0.6 && (!a.area || !c.areas.length || c.areas.includes(a.area))).sort((x, y) => x.carga - y.carga)[0];
      if (!destino) continue;
      itens.push({
        id: `redist-${a.id}`,
        tipo: "redistribuir",
        texto: `${sob.nome} está com carga ${sob.carga} (${sob.abertas} abertas, ${sob.atrasadas} atrasadas); ${destino.nome} está com ${destino.carga}. Sugestão: passar "${a.titulo}" (${nomeCli(a.clienteId)}, ${TIPOS[a.tipo] ?? a.tipo}${a.prazo ? `, prazo ${a.prazo.split("-").reverse().join("/")}` : ""}) para ${destino.nome}.`,
        acoes: [
          { tipo: "reatribuir", activityId: a.id, paraId: destino.id, paraNome: destino.nome, rotulo: `Passar para ${destino.nome}` },
          { tipo: "abrir", href: linkAtividade(a.id), rotulo: "Ver atividade" },
        ],
      });
    }
  }

  /* 6) publicações sem tratar há 2+ dias */
  const pubParadas = (pubNovas ?? []).filter((x) => x.status === "nao_tratada" && !x.activity_id && Date.now() - Date.parse(x.created_at as string) > 2 * DIA);
  if (pubParadas.length) itens.push({ id: "pubs", tipo: "publicacoes_paradas", texto: `${pubParadas.length} publicação(ões) chegaram há mais de 2 dias e ninguém tratou.`, acoes: [{ tipo: "abrir", href: "/admin/publicacoes", rotulo: "Ver publicações" }] });

  /* 7) empresas sem nenhuma atividade em 30 dias */
  const ha30 = new Date(Date.now() - 30 * DIA).toISOString();
  const pjParados = base.clientes.filter((c) => c.ativo && !c.pf && !ats.some((a) => a.clienteId === c.id && (a.criada >= ha30 || aberta(a))));
  if (pjParados.length) itens.push({ id: "pj-parados", tipo: "empresas_sem_atividade", texto: `${pjParados.length} empresa(s) ativas sem nenhuma atividade há 30 dias: ${pjParados.slice(0, 5).map((c) => c.nome).join(", ")}${pjParados.length > 5 ? "…" : ""}.`, acoes: [{ tipo: "abrir", href: "/admin/painel?aba=clientes", rotulo: "Ver clientes" }] });

  /* 8) Distribuição parada */
  if (m.distribuicao.pendentesHaMaisDe2Dias) itens.push({ id: "dist", tipo: "distribuicao_parada", texto: `${m.distribuicao.pendentesHaMaisDe2Dias} item(ns) na Distribuição esperando decisão há mais de 2 dias (${m.distribuicao.pendentesAgora} pendentes no total).`, acoes: [{ tipo: "abrir", href: "/admin/distribuicao", rotulo: "Abrir Distribuição" }] });

  /* 9) robôs */
  if (!m.sistema.agenteNoAr) itens.push({ id: "agente", tipo: "sistema", texto: "O Agente MC (WhatsApp) está fora do ar.", acoes: [{ tipo: "abrir", href: "/admin/whatsapp", rotulo: "Ver WhatsApp" }] });
  if (m.sistema.publicacoes?.erro) itens.push({ id: "robo-pub", tipo: "sistema", texto: `O robô de publicações deu erro na última rodada (${m.sistema.publicacoes.erro.slice(0, 60)}).`, acoes: [{ tipo: "abrir", href: "/admin/publicacoes", rotulo: "Ver publicações" }] });

  const fatos = {
    hoje,
    periodo: p.rotulo,
    atividades: {
      novas: novas.length,
      novasPorCliente: [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${nomeCli(c)}: ${n}`),
      concluidas: concl.length,
      concluidasPorPessoa: [...conclPorPessoa.entries()].map(([r, xs]) => `${nomeResp(r === "-" ? null : r)}: ${xs.length} (${xs.slice(0, 3).map((x) => x.titulo).join("; ")})`),
      abertas: ats.filter(aberta).length,
      atrasadas: atrasadas.length,
      maisAntigaAtrasada: atrasadas[0] ? `${atrasadas[0].titulo} – ${nomeCli(atrasadas[0].clienteId)}, desde ${dataBahia(`${atrasadas[0].prazo}T12:00:00Z`).split("-").reverse().join("/")}` : null,
    },
    whatsapp: { respostaMedianaHoras: m.atendimento.respostaMedianaHoras, recebidas: m.atendimento.recebidas, esperandoAgora: m.atendimento.esperandoAgora.slice(0, 5).map((e) => `${e.cliente ?? e.conversa} (${e.horas} h)`) },
    distribuicao: { chegaram: m.distribuicao.chegaram, aprovadas: m.distribuicao.aceitas, descartadas: m.distribuicao.descartadas, pendentes: m.distribuicao.pendentesAgora },
    cargaDaEquipe: carga.map((c) => `${c.nome}: carga ${c.carga}, ${c.abertas} abertas, ${c.atrasadas} atrasadas, ${c.amanha} vencem amanhã`),
    saude: m.saude,
  };
  return { periodo: p, fatos, itens };
}

const SCHEMA = {
  type: "object",
  properties: {
    resumo: { type: "array", maxItems: 3, items: { type: "string" }, description: "2 ou 3 parágrafos curtos" },
    sugestoes: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        properties: { item: { type: "string", description: "id do item usado (ou vazio)" }, texto: { type: "string" }, prioridade: { type: "string", enum: ["alta", "media", "baixa"] } },
        required: ["item", "texto", "prioridade"],
      },
    },
  },
  required: ["resumo", "sugestoes"],
};

const SISTEMA = `Você é o gerente do escritório MC Advogados e passa o relatório para o dono. Português do Brasil, tom de gerente de confiança: direto, concreto, sem enrolação e sem elogios genéricos.
"resumo": 2 ou 3 parágrafos curtos sobre o período: o que entrou, o que cada pessoa concluiu (cite nomes e 1-2 títulos), o que está atrasado, WhatsApp e Distribuição. Não comece com saudação (ela já aparece na tela).
"sugestoes": até 6 sugestões do que o dono deve fazer/mandar fazer, da mais urgente para a menos. Use SOMENTE os itens fornecidos (informe o id em "item") e reescreva cada um como recomendação ("Sugiro passar… porque…", "Avise a … hoje…"). Nunca sugira passar uma atividade para quem já é o responsável dela; redistribuição só nos itens do tipo "redistribuir". Não invente números, nomes, prazos nem relações que não estejam nos dados. Não use "ele"/"ela" nem "o"/"a" antes do nome de clientes (escreva "Responder Kelia…", não "Avise a Kelia").`;

/** Lê do cache ou gera (1 chamada barata). */
export async function relatorioDoGerente(periodoId: string, { forcar = false } = {}): Promise<{ ok: true; gerente: Gerente } | { ok: false; error: string }> {
  const p = periodoDe(periodoId);
  const chave = `${p.id}|${dataBahia(p.ini)}`;
  const fechado = p.id === "ontem" || p.id === "mes-anterior";
  const { data: cache } = await db().from("painel_gerente").select("conteudo, created_at").eq("chave", chave).maybeSingle();
  if (cache && !forcar && (fechado || Date.now() - Date.parse(cache.created_at as string) < VALIDADE_MS)) return { ok: true, gerente: cache.conteudo as Gerente };

  const { fatos, itens } = await fatosDoGerente(p.id);
  const r = await generateJson<{ resumo: string[]; sugestoes: { item: string; texto: string; prioridade: "alta" | "media" | "baixa" }[] }>({
    model: MODELOS.assistente,
    system: SISTEMA,
    parts: [{ text: JSON.stringify({ fatos, itens: itens.map((i) => ({ id: i.id, tipo: i.tipo, texto: i.texto })) }) }],
    schema: SCHEMA,
  });
  if (!r.ok) {
    if (cache) return { ok: true, gerente: cache.conteudo as Gerente };
    return r;
  }
  const porId = new Map(itens.map((i) => [i.id, i]));
  const gerente: Gerente = {
    resumo: r.data.resumo.filter(Boolean).slice(0, 3),
    sugestoes: r.data.sugestoes.slice(0, 6).map((s) => ({ texto: s.texto, prioridade: s.prioridade, acoes: porId.get(s.item)?.acoes ?? [] })),
    geradoEm: new Date().toISOString(),
    periodo: p.rotulo,
  };
  await db().from("painel_gerente").upsert({ chave, conteudo: gerente, created_at: gerente.geradoEm });
  return { ok: true, gerente };
}

/**
 * Cron das 7h: o gerente manda no WhatsApp do Maurício o resumo de ONTEM e o
 * que fazer hoje (1 vez por dia; marca em painel_sugestoes para não repetir).
 */
export async function enviarGerenteDoDia(): Promise<string> {
  const dia = hojeBahia();
  const { data: ja } = await db().from("painel_sugestoes").select("enviado_em").eq("dia", dia).maybeSingle();
  if (ja?.enviado_em) return "já enviado hoje";
  const r = await relatorioDoGerente("ontem");
  if (!r.ok) return `erro: ${r.error}`;
  const g = r.gerente;
  const { data: resp } = await db().from("responsaveis").select("telefone").eq("profile_id", MAURICIO).maybeSingle();
  const telefone = String(resp?.telefone ?? "").replace(/\D/g, "");
  if (telefone.length < 10) return "sem telefone do Maurício em Responsáveis";
  const bola = { alta: "🔴", media: "🟡", baixa: "🟢" } as const;
  const ontem = somaDias(dia, -1).split("-").reverse().slice(0, 2).join("/");
  const texto = [
    `*Bom dia, Maurício! Resumo de ontem (${ontem})*`,
    "",
    ...g.resumo.flatMap((p) => [p, ""]),
    "*O que eu sugiro para hoje:*",
    ...g.sugestoes.map((s, i) => `${bola[s.prioridade] ?? "•"} ${i + 1}. ${s.texto}`),
    "",
    "Painel completo: mcadvogados.app.br/admin/painel",
  ].join("\n");
  const { enfileirarMensagem } = await import("@/lib/zap/fila");
  const job = await enfileirarMensagem({ para: telefone, texto, origemRef: `painel-gerente:${dia}`, expiraEm: new Date(Date.now() + 12 * 3_600_000) });
  if (!job) return "falha ao enfileirar";
  await db().from("painel_sugestoes").upsert({ dia, texto: JSON.stringify({ resumo: g.resumo.join("\n\n"), itens: g.sugestoes.map((s) => ({ titulo: s.texto.slice(0, 80), acao: s.texto, prioridade: s.prioridade })) }), metricas: { origem: "gerente" }, enviado_em: new Date().toISOString() });
  return "enviado";
}
