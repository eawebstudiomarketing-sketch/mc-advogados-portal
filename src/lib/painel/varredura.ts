import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { calcularMetricas, tudo } from "./metricas";
import { carregarBase } from "./dados";
import { equipeNoZap } from "./equipe-zap";
import { DIA, aberta, atrasada, dataBahia, dentro, dias, hojeBahia, pesoAtividade, periodoDe, somaDias, TIPOS, type LinhaAtividade } from "./base";

// Varredura do gerente (24/10/2026): passa por todo o sistema no período do
// filtro e devolve "achados" — um fato, uma sugestão e as ações possíveis
// (cada ação só roda depois de confirmada na tela). Tudo aqui é código; a
// única IA é a checagem de "disse no zap que fez, mas a atividade está
// aberta", feita só nas poucas mensagens candidatas.

const db = () => createAdminClient() as unknown as SupabaseClient;

export type AcaoGerente =
  | { tipo: "abrir"; rotulo: string; href: string }
  | { tipo: "reatribuir"; rotulo: string; activityId: string; paraId: string; paraNome: string }
  | { tipo: "marcar_reuniao"; rotulo: string; clienteId: string; clienteNome: string; responsavelId: string | null; responsavelNome: string | null; inicio: string; titulo: string; mensagem: string; destino: string | null; destinoNome: string | null }
  | { tipo: "responder"; rotulo: string; chatJid: string; clienteNome: string; ultima: string; texto: string | null }
  | { tipo: "alertar"; rotulo: string; pessoas: { profileId: string; nome: string; telefone: string | null }[]; titulo: string; corpo: string; url: string }
  | { tipo: "concluir"; rotulo: string; activityId: string; titulo: string }
  | { tipo: "mover_prazos"; rotulo: string; itens: { id: string; titulo: string; prazo: string }[]; novaData: string }
  | { tipo: "lembrar_assinatura"; rotulo: string; assinaturas: { id: string; nome: string }[]; ataTitulo: string };

export type SecaoId = "clientes" | "whatsapp" | "inconsistencias" | "agenda" | "rotinas" | "atividades" | "distribuicao" | "publicacoes" | "atas" | "relatorios" | "sistema";
export const SECOES: { id: SecaoId; titulo: string }[] = [
  { id: "clientes", titulo: "Clientes e onboarding" },
  { id: "whatsapp", titulo: "WhatsApp" },
  { id: "inconsistencias", titulo: "Inconsistências" },
  { id: "agenda", titulo: "Agenda e carga" },
  { id: "rotinas", titulo: "Rotinas" },
  { id: "atividades", titulo: "Atividades" },
  { id: "distribuicao", titulo: "Distribuição" },
  { id: "publicacoes", titulo: "Publicações e andamentos" },
  { id: "atas", titulo: "Atas" },
  { id: "relatorios", titulo: "Relatórios mensais" },
  { id: "sistema", titulo: "Sistema" },
];
export type Achado = { id: string; secao: SecaoId; prioridade: "alta" | "media" | "baixa"; fato: string; sugestao: string; acoes: AcaoGerente[] };

const curto = (n: string) => n.replace(/^(Dra?\.)\s+/i, "$1 ").split(" ").slice(0, 2).join(" ");
const br = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
const trecho = (t: string | null | undefined, n = 90) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const diaUtil = (d: string) => {
  const w = new Date(`${d}T12:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6;
};
const proximoDiaUtil = (d: string) => {
  let x = somaDias(d, 1);
  while (!diaUtil(x)) x = somaDias(x, 1);
  return x;
};
/** A mensagem do cliente pede resposta? (pergunta, pedido, cobrança) */
function pedeResposta(t: string) {
  if (/\?/.test(t)) return true;
  if (/\b(novidade|not[ií]cia|preciso|precisamos|poderia|podem|pode me|consegue|quando|qual|quanto|d[uú]vida|gostaria|por favor|urgente|retorno|aguardo|aguardando|ajuda|me (liga|ligue|chama)|como (fa[çz]|fica|est))/i.test(t)) return true;
  if (/^(ok|okay|obrigad|agrade|valeu|blz|beleza|show|perfeito|top|certo|combinado|bom dia|boa tarde|boa noite|amém|amem|que bom|ótimo|otimo|maravilha|nós que|essa mensagem)/i.test(t.trim())) return false;
  return t.length > 80;
}
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const nomeDia = (d: string, hoje: string) => (d === hoje ? "hoje" : d === somaDias(hoje, 1) ? "amanhã" : `${SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]} (${br(d)})`);

export async function varrer(periodoId: string) {
  const p = periodoDe(periodoId);
  const hoje = hojeBahia();
  const amanha = somaDias(hoje, 1);
  const agora = new Date().toISOString();
  const [m, base, membroDaEquipe] = await Promise.all([calcularMetricas(p), carregarBase(), equipeNoZap()]);
  const ats = base.atividades;
  const cli = new Map(base.clientes.map((c) => [c.id, c]));
  const resp = new Map(base.responsaveis.map((r) => [r.id, r]));
  const nomeCli = (id: string | null) => (id ? cli.get(id)?.nome ?? "?" : "sem cliente");
  const nomeResp = (id: string | null) => (id ? curto(resp.get(id)?.nome ?? "?") : "sem responsável");
  const equipeIds = new Set(m.equipe.map((e) => e.id));
  const equipe = base.responsaveis.filter((r) => r.profileId && equipeIds.has(r.profileId));
  const out: Achado[] = [];
  const add = (a: Achado) => out.push(a);

  const [{ data: respsTel }, { data: chats }, { data: cadastro }, { data: handoffs }, { data: onbs }, { data: comps }, { data: atasRel }] = await Promise.all([
    db().from("responsaveis").select("id, profile_id, telefone"),
    db().from("wa_chats").select("chat_jid, nome, client_id, is_group, ultima_msg_em").not("client_id", "is", null),
    db().from("clients").select("id, name, tipo_pessoa, documento, email_contact, telefones, whatsapp_numeros, endereco, created_at, active, archived_at"),
    db().from("client_handoffs").select("client_id, handoff"),
    db().from("onboardings").select("id, client_id, answers, created_at"),
    db().from("compromissos").select("id, titulo, tipo, inicio, fim, client_id, participantes").gte("inicio", new Date(Date.now() - 120 * DIA).toISOString()).lte("inicio", new Date(Date.now() + 21 * DIA).toISOString()),
    db().from("atas").select("id, titulo, tipo, client_id, status, data_reuniao"),
  ]);
  const telDe = new Map(((respsTel ?? []) as { id: string; profile_id: string | null; telefone: string | null }[]).map((r) => [r.id, r.telefone]));
  type Chat = { chat_jid: string; nome: string | null; client_id: string; is_group: boolean; ultima_msg_em: string | null };
  const chatsDe = new Map<string, Chat[]>();
  for (const c of (chats ?? []) as Chat[]) chatsDe.set(c.client_id, [...(chatsDe.get(c.client_id) ?? []), c]);
  /** Onde falar com o cliente: o grupo de assessoria, senão a conversa. */
  const destinoCliente = (clienteId: string): { jid: string; nome: string } | null => {
    const cs = chatsDe.get(clienteId) ?? [];
    const g = cs.find((c) => c.is_group) ?? cs[0];
    return g ? { jid: g.chat_jid, nome: g.nome ?? (g.is_group ? "grupo do cliente" : "conversa do cliente") } : null;
  };
  type Comp = { id: string; titulo: string; tipo: string; inicio: string; fim: string | null; client_id: string | null; participantes: string[] };
  const compromissos = (comps ?? []) as Comp[];
  const pessoa = (rid: string) => {
    const r = resp.get(rid);
    return r?.profileId ? { profileId: r.profileId, nome: curto(r.nome), telefone: telDe.get(rid) ?? null } : null;
  };

  /** Primeiro horário livre (dia útil, 9–17h) do responsável a partir de amanhã. */
  const horarioLivre = (rid: string | null) => {
    const ocupado = (dia: string, h: number) =>
      compromissos.some((c) => (!rid || c.participantes.includes(rid)) && dataBahia(c.inicio) === dia && Number(new Date(c.inicio).toLocaleString("en-US", { timeZone: "America/Bahia", hour: "2-digit", hour12: false })) % 24 === h) ||
      ats.some((a) => a.respId === rid && aberta(a) && a.categoria === "audiencia" && a.prazo === dia && a.hora && Number(a.hora.slice(0, 2)) === h);
    let d = proximoDiaUtil(hoje);
    for (let k = 0; k < 10; k++, d = proximoDiaUtil(d)) for (const h of [10, 9, 11, 14, 15, 16]) if (!ocupado(d, h)) return new Date(`${d}T${String(h).padStart(2, "0")}:00:00-03:00`).toISOString();
    return new Date(`${proximoDiaUtil(hoje)}T10:00:00-03:00`).toISOString();
  };
  const quandoBr = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  /* ───────── 1) Clientes e onboarding ───────── */
  type Cad = { id: string; name: string; tipo_pessoa: string; documento: string | null; email_contact: string | null; telefones: string[] | null; whatsapp_numeros: string[] | null; endereco: unknown; created_at: string; active: boolean; archived_at: string | null };
  const cads = ((cadastro ?? []) as Cad[]).filter((c) => c.active && !c.archived_at);
  const novos = cads.filter((c) => dentro(c.created_at, p.ini, p.fim));
  const novosAnt = ((cadastro ?? []) as Cad[]).filter((c) => dentro(c.created_at, p.iniAnterior, p.fimAnterior)).length;
  if (novos.length)
    add({
      id: "cli-novos",
      secao: "clientes",
      prioridade: "baixa",
      fato: `Entraram ${novos.length} cliente(s) novo(s) (${novos.filter((c) => c.tipo_pessoa === "PJ").length} empresas, ${novos.filter((c) => c.tipo_pessoa === "PF").length} PF)${novosAnt ? `; no período anterior foram ${novosAnt}` : ""}: ${novos.slice(0, 5).map((c) => c.name).join(", ")}${novos.length > 5 ? "…" : ""}.`,
      sugestao: "",
      acoes: [{ tipo: "abrir", rotulo: "Ver clientes", href: "/admin/clients" }],
    });
  const hand = new Map(((handoffs ?? []) as { client_id: string; handoff: unknown }[]).map((h) => [h.client_id, h.handoff]));
  const onbDe = new Map<string, { id: string; respostas: number }>();
  for (const o of (onbs ?? []) as { id: string; client_id: string; answers: Record<string, unknown> | null }[]) {
    const n = Object.values(o.answers ?? {}).filter((v) => v !== null && v !== "" && !(Array.isArray(v) && !v.length)).length;
    const ja = onbDe.get(o.client_id);
    if (!ja || n > ja.respostas) onbDe.set(o.client_id, { id: o.id, respostas: n });
  }
  const reuniaoOnb = (cid: string) =>
    compromissos.some((c) => c.client_id === cid && /onboard|boas[- ]vindas|alinhamento inicial/i.test(c.titulo)) || ((atasRel ?? []) as { client_id: string | null; tipo: string }[]).some((a) => a.client_id === cid && a.tipo === "onboarding");
  const faltaNoCadastro = (c: Cad) =>
    [!c.documento && "CNPJ/CPF", !c.email_contact && "e-mail", !(c.telefones?.length || c.whatsapp_numeros?.length) && "telefone", !c.endereco && "endereço"].filter(Boolean) as string[];
  // onboarding: só quem entrou nos últimos 30 dias (os antigos vieram da importação)
  const recentes = cads.filter((c) => c.tipo_pessoa === "PJ" && Date.now() - Date.parse(c.created_at) < 30 * DIA);
  for (const c of recentes.slice(0, 8)) {
    const faltaCad = faltaNoCadastro(c);
    const semHandoff = !hand.get(c.id);
    const onb = onbDe.get(c.id);
    const semReuniao = !reuniaoOnb(c.id);
    const pend = [faltaCad.length ? `cadastro sem ${faltaCad.join(", ")}` : null, semHandoff ? "ficha de handoff não preenchida" : null, !onb ? "onboarding não gerado" : onb.respostas < 3 ? "onboarding sem respostas" : null, semReuniao ? "reunião de onboarding não marcada" : null].filter(Boolean) as string[];
    if (!pend.length) continue;
    const quemCuida = ats.find((a) => a.clienteId === c.id && aberta(a) && a.respId)?.respId ?? null;
    const destino = destinoCliente(c.id);
    const acoes: AcaoGerente[] = [];
    if (semReuniao) {
      const inicio = horarioLivre(quemCuida);
      acoes.push({
        tipo: "marcar_reuniao",
        rotulo: "marcar reunião?",
        clienteId: c.id,
        clienteNome: c.name,
        responsavelId: quemCuida,
        responsavelNome: quemCuida ? nomeResp(quemCuida) : null,
        inicio,
        titulo: `Reunião de onboarding – ${c.name}`,
        mensagem: `Olá! Aqui é do escritório MC Advogados. Para darmos andamento ao seu onboarding, deixamos pré-agendada uma reunião para ${quandoBr(inicio)}. Esse horário funciona para vocês? Se precisar, sugerimos outro.`,
        destino: destino?.jid ?? null,
        destinoNome: destino?.nome ?? null,
      });
    }
    if (!onb) acoes.push({ tipo: "abrir", rotulo: "gerar onboarding", href: `/admin/onboarding/new?clientId=${c.id}` });
    else if (onb.respostas < 3) acoes.push({ tipo: "abrir", rotulo: "abrir onboarding", href: `/admin/clients/${c.id}?aba=onboarding` });
    if (faltaCad.length) acoes.push({ tipo: "abrir", rotulo: "completar cadastro", href: `/admin/clients/${c.id}` });
    if (semHandoff) acoes.push({ tipo: "abrir", rotulo: "preencher handoff", href: `/admin/clients/${c.id}/handoff` });
    add({ id: `onb-${c.id}`, secao: "clientes", prioridade: semReuniao || !onb ? "alta" : "media", fato: `${c.name} entrou em ${br(dataBahia(c.created_at))} e está com: ${pend.join("; ")}.`, sugestao: semReuniao ? "Marcar a reunião de onboarding." : "Completar o que falta.", acoes });
  }
  // empresas antigas com cadastro/handoff incompletos: um ponto só
  const antigas = cads.filter((c) => c.tipo_pessoa === "PJ" && !recentes.includes(c));
  const cadIncompleto = antigas.filter((c) => faltaNoCadastro(c).length);
  const semHand = antigas.filter((c) => !hand.get(c.id));
  if (cadIncompleto.length || semHand.length) {
    const cont = new Map<string, number>();
    for (const c of cadIncompleto) for (const x of faltaNoCadastro(c)) cont.set(x, (cont.get(x) ?? 0) + 1);
    const falta = [...cont.entries()].sort((a, b) => b[1] - a[1]).map(([x, n]) => `${x} em ${n}`).join(", ");
    add({
      id: "cli-fichas",
      secao: "clientes",
      prioridade: "baixa",
      fato: `${cadIncompleto.length} empresa(s) com cadastro incompleto (falta ${falta})${semHand.length ? ` e ${semHand.length} sem ficha de handoff` : ""}.`,
      sugestao: "Completar as fichas aos poucos.",
      acoes: cadIncompleto.slice(0, 3).map((c) => ({ tipo: "abrir" as const, rotulo: c.name.length > 22 ? `${c.name.slice(0, 20)}…` : c.name, href: `/admin/clients/${c.id}` })),
    });
  }

  /* ───────── 2) WhatsApp ───────── */
  const jidsCli = [...new Set(((chats ?? []) as Chat[]).map((c) => c.chat_jid))];
  type Msg = { chat_jid: string; from_me: boolean; wa_timestamp: string; sender_jid: string | null; texto: string | null };
  const msgs = jidsCli.length
    ? await tudo<Msg>((a, b) => db().from("wa_messages").select("chat_jid, from_me, wa_timestamp, sender_jid, texto").in("chat_jid", jidsCli).gte("wa_timestamp", new Date(Date.now() - 30 * DIA).toISOString()).order("wa_timestamp").range(a, b))
    : [];
  const nossa = (x: Msg) => x.from_me || !!membroDaEquipe(x.sender_jid);
  const porChat = new Map<string, Msg[]>();
  for (const x of msgs) porChat.set(x.chat_jid, [...(porChat.get(x.chat_jid) ?? []), x]);
  const chatInfo = new Map(((chats ?? []) as Chat[]).map((c) => [c.chat_jid, c]));
  const esperas: { jid: string; cid: string; desde: string; ultimas: string[] }[] = [];
  for (const [jid, xs] of porChat) {
    const c = chatInfo.get(jid)!;
    let k = xs.length - 1;
    const deles: Msg[] = [];
    while (k >= 0 && !nossa(xs[k])) deles.unshift(xs[k--]);
    if (!deles.length) continue;
    const textos = deles.map((d) => trecho(d.texto, 160)).filter(Boolean);
    // "ok, obrigado", agradecimentos e figurinhas não pedem resposta
    if (!textos.some(pedeResposta)) continue;
    esperas.push({ jid, cid: c.client_id, desde: deles[0].wa_timestamp, ultimas: textos.slice(-3) });
  }
  const andNovos = await db()
    .from("andamentos")
    .select("process_id, descricao, created_at, processes!inner(client_id, numero_processo)")
    .gte("created_at", new Date(Date.now() - 10 * DIA).toISOString())
    .neq("situacao", "historico")
    .limit(400);
  const novidade = new Map<string, string>();
  for (const a of (andNovos.data ?? []) as unknown as { descricao: string | null; processes: { client_id: string | null; numero_processo: string | null } }[]) {
    const cid = a.processes?.client_id;
    if (cid && !novidade.has(cid)) novidade.set(cid, `${trecho(String(a.descricao ?? "").replace(/^\s*N[°º]\s*\d+\s*/i, "").split(/\n/)[0], 80)} (processo ${a.processes.numero_processo ?? ""})`);
  }
  for (const e of esperas.sort((a, b) => a.desde.localeCompare(b.desde)).filter((e) => Date.now() - Date.parse(e.desde) > 3 * 3_600_000).slice(0, 8)) {
    const horas = Math.round((Date.now() - Date.parse(e.desde)) / 3_600_000);
    const tempo = horas < 48 ? `${horas} h` : `${Math.round(horas / 24)} dias`;
    const nov = novidade.get(e.cid);
    const info = chatInfo.get(e.jid)!;
    add({
      id: `zap-${e.jid}`,
      secao: "whatsapp",
      prioridade: horas > 48 ? "alta" : "media",
      fato: `${nomeCli(e.cid)} ${info.is_group ? "(no grupo)" : ""} está sem resposta da equipe há ${tempo}. Última mensagem: "${e.ultimas[e.ultimas.length - 1]}"${nov ? `. Tem novidade no processo: ${nov}` : ""}.`,
      sugestao: nov ? "Responder já aproveitando o andamento novo." : "Responder.",
      acoes: [{ tipo: "responder", rotulo: "responder?", chatJid: e.jid, clienteNome: nomeCli(e.cid), ultima: e.ultimas.join(" / "), texto: null }],
    });
  }
  // grupos de assessoria sem nenhuma mensagem da equipe em 7 dias
  const ha7 = new Date(Date.now() - 7 * DIA).toISOString();
  const gruposQuietos = ((chats ?? []) as Chat[]).filter((c) => c.is_group && cli.get(c.client_id)?.ativo && !(porChat.get(c.chat_jid) ?? []).some((x) => nossa(x) && x.wa_timestamp >= ha7));
  if (gruposQuietos.length)
    add({
      id: "zap-grupos-quietos",
      secao: "whatsapp",
      prioridade: "baixa",
      fato: `${gruposQuietos.length} grupo(s) de assessoria sem nenhuma mensagem da equipe há 7 dias: ${gruposQuietos.slice(0, 5).map((g) => nomeCli(g.client_id)).join(", ")}${gruposQuietos.length > 5 ? "…" : ""}.`,
      sugestao: "Mandar uma atualização do que está em andamento.",
      acoes: gruposQuietos.slice(0, 3).map((g) => ({ tipo: "responder" as const, rotulo: `atualizar ${curto(nomeCli(g.client_id))}?`, chatJid: g.chat_jid, clienteNome: nomeCli(g.client_id), ultima: "", texto: null })),
    });

  /* ───────── 3) Inconsistências ───────── */
  // atividades concluídas no período sem nenhum retorno ao cliente depois (por cliente; reuniões não contam)
  const semRetorno = new Map<string, LinhaAtividade[]>();
  for (const a of ats.filter((x) => x.status === "concluida" && dentro(x.concluida, p.ini, p.fim) && x.clienteId && x.tipo !== "reuniao" && !/reuni[aã]o/i.test(x.titulo))) {
    const cs = chatsDe.get(a.clienteId!) ?? [];
    if (!cs.length || Date.now() - Date.parse(a.concluida!) < 6 * 3_600_000) continue;
    if (cs.some((c) => (porChat.get(c.chat_jid) ?? []).some((x) => nossa(x) && x.wa_timestamp >= a.concluida!))) continue;
    semRetorno.set(a.clienteId!, [...(semRetorno.get(a.clienteId!) ?? []), a]);
  }
  for (const [cid, xs] of [...semRetorno.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5)) {
    const dest = destinoCliente(cid)!;
    add({
      id: `semretorno-${cid}`,
      secao: "inconsistencias",
      prioridade: "media",
      fato: `${xs.length} atividade(s) de ${nomeCli(cid)} foram concluídas (${xs.slice(0, 3).map((a) => `"${a.titulo}" por ${nomeResp(a.respId)}`).join(", ")}${xs.length > 3 ? "…" : ""}), mas ninguém deu retorno ao cliente no WhatsApp depois.`,
      sugestao: "Mandar um retorno ao cliente com o que foi entregue.",
      acoes: [{ tipo: "responder", rotulo: "avisar cliente?", chatJid: dest.jid, clienteNome: nomeCli(cid), ultima: "", texto: `Olá! Passando para atualizar vocês: concluímos ${xs.map((a) => a.titulo).join("; ")}. Qualquer dúvida, estamos à disposição.` }],
    });
  }
  // "disse que fez" no zap × atividade aberta (IA só nas candidatas)
  const PALAVRAS = /\b(feito|conclu[ií]d[oa]|finalizad[oa]|enviad[oa]|segue( em)? anexo|segue o|pronto|entregue|protocolad[oa]|assinad[oa])\b/i;
  const ha3 = new Date(Date.now() - 3 * DIA).toISOString();
  const candidatas: { k: number; quem: string; cid: string; texto: string; abertas: { id: string; titulo: string }[] }[] = [];
  for (const x of msgs) {
    if (x.wa_timestamp < ha3 || !x.texto || !PALAVRAS.test(x.texto)) continue;
    const autor = x.from_me ? null : membroDaEquipe(x.sender_jid);
    if (!x.from_me && !autor) continue;
    const cid = chatInfo.get(x.chat_jid)?.client_id;
    if (!cid) continue;
    const abertas = ats.filter((a) => a.clienteId === cid && aberta(a)).map((a) => ({ id: a.id, titulo: a.titulo }));
    if (!abertas.length) continue;
    const quem = autor ? curto(base.responsaveis.find((r) => r.profileId === autor)?.nome ?? "alguém da equipe") : "o número do escritório";
    candidatas.push({ k: candidatas.length, quem, cid, texto: trecho(x.texto, 200), abertas: abertas.slice(0, 12) });
    if (candidatas.length >= 12) break;
  }
  if (candidatas.length) {
    const r = await generateJson<{ casos: { k: number; atividade: string }[] }>({
      model: MODELOS.assistente,
      system: "Para cada mensagem de um advogado ao cliente, diga se ela afirma que UMA das atividades listadas foi feita/entregue. Responda o id da atividade ou vazio se não der para afirmar com segurança.",
      parts: [{ text: JSON.stringify(candidatas.map((c) => ({ k: c.k, mensagem: c.texto, atividades: c.abertas }))) }],
      schema: { type: "object", properties: { casos: { type: "array", items: { type: "object", properties: { k: { type: "integer" }, atividade: { type: "string" } }, required: ["k", "atividade"] } } }, required: ["casos"] },
    });
    if (r.ok)
      for (const caso of r.data.casos) {
        const c = candidatas.find((x) => x.k === caso.k);
        const a = c && ats.find((x) => x.id === caso.atividade && aberta(x));
        if (!c || !a || out.some((o) => o.id === `incons-${a.id}`)) continue;
        const dono = a.respId ? pessoa(a.respId) : null;
        add({
          id: `incons-${a.id}`,
          secao: "inconsistencias",
          prioridade: "media",
          fato: `${c.quem} escreveu no WhatsApp de ${nomeCli(c.cid)}: "${trecho(c.texto, 110)}", mas a atividade "${a.titulo}" continua aberta no portal (responsável: ${nomeResp(a.respId)}).`,
          sugestao: "Concluir a atividade ou alertar o responsável.",
          acoes: [
            { tipo: "concluir", rotulo: "marcar concluída?", activityId: a.id, titulo: a.titulo },
            ...(dono ? [{ tipo: "alertar" as const, rotulo: `alertar ${dono.nome}?`, pessoas: [dono], titulo: "Atividade parece feita, mas está aberta", corpo: `"${a.titulo}" (${nomeCli(a.clienteId)}) foi dada como feita no WhatsApp, mas continua aberta no portal. Pode conferir e concluir?`, url: `/admin/activities/${a.id}` }] : []),
          ],
        });
      }
  }

  /* ───────── 4) Agenda e carga ───────── */
  const compsHoje = compromissos.filter((c) => dataBahia(c.inicio) === hoje).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const audHoje = ats.filter((a) => aberta(a) && a.categoria === "audiencia" && a.prazo === hoje);
  if (compsHoje.length || audHoje.length)
    add({
      id: "agenda-hoje",
      secao: "agenda",
      prioridade: "baixa",
      fato: `Hoje: ${[...compsHoje.map((c) => `${new Date(c.inicio).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" })} ${c.titulo}`), ...audHoje.map((a) => `${a.hora ?? ""} audiência ${a.titulo} (${nomeResp(a.respId)})`)].join("; ")}.`,
      sugestao: "",
      acoes: [{ tipo: "abrir", rotulo: "ver agenda", href: "/admin/agenda" }],
    });
  for (const r of equipe) {
    for (const d of [hoje, amanha, somaDias(hoje, 2), somaDias(hoje, 3)].filter(diaUtil)) {
      const reunioes = compromissos.filter((c) => c.participantes.includes(r.id) && dataBahia(c.inicio) === d).length + ats.filter((a) => a.respId === r.id && aberta(a) && a.categoria === "audiencia" && a.prazo === d).length;
      const prazos = ats.filter((a) => a.respId === r.id && aberta(a) && a.categoria !== "audiencia" && a.prazo === d);
      if (reunioes >= 3 && prazos.length) {
        const nova = proximoDiaUtil(d);
        add({
          id: `carga-${r.id}-${d}`,
          secao: "agenda",
          prioridade: "media",
          fato: `${curto(r.nome)} tem ${reunioes} reuniões/audiências ${nomeDia(d, hoje)} e ainda ${prazos.length} atividade(s) vencendo no mesmo dia.`,
          sugestao: `Passar essas atividades para ${nomeDia(nova, hoje)}.`,
          acoes: [{ tipo: "mover_prazos", rotulo: "mudar datas?", itens: prazos.map((a) => ({ id: a.id, titulo: a.titulo, prazo: a.prazo! })), novaData: nova }],
        });
      }
    }
  }

  /* ───────── 5) Rotinas ───────── */
  const ontemUtil = (() => {
    let d = somaDias(hoje, -1);
    while (!diaUtil(d)) d = somaDias(d, -1);
    return d;
  })();
  const [{ data: itensRot }, { data: feitosRot }] = await Promise.all([
    db().from("rotina_itens").select("id, responsavel_id, titulo, dias, ativo").eq("ativo", true),
    db().from("rotina_feitos").select("item_id, responsavel_id, dia").gte("dia", somaDias(hoje, -7)),
  ]);
  type ItemR = { id: string; responsavel_id: string; titulo: string; dias: number[] };
  const wOntem = new Date(`${ontemUtil}T12:00:00Z`).getUTCDay();
  const feitosSet = new Set(((feitosRot ?? []) as { item_id: string; dia: string }[]).map((f) => `${f.item_id}|${f.dia}`));
  const naoFeitos = new Map<string, string[]>();
  for (const it of (itensRot ?? []) as ItemR[]) if (it.dias.includes(wOntem) && !feitosSet.has(`${it.id}|${ontemUtil}`)) naoFeitos.set(it.responsavel_id, [...(naoFeitos.get(it.responsavel_id) ?? []), it.titulo]);
  const semRotina = [...naoFeitos.entries()].map(([rid, titulos]) => ({ rid, titulos, ps: pessoa(rid) })).filter((x) => x.ps);
  if (semRotina.length) {
    const repetidos = ((itensRot ?? []) as ItemR[]).filter(
      (it) => [1, 2, 3, 4, 5, 6, 7].map((k) => somaDias(hoje, -k)).filter((d) => diaUtil(d) && it.dias.includes(new Date(`${d}T12:00:00Z`).getUTCDay()) && !feitosSet.has(`${it.id}|${d}`)).length >= 3
    );
    add({
      id: "rotinas",
      secao: "rotinas",
      prioridade: "baixa",
      fato: `Na rotina de ${nomeDia(ontemUtil, hoje)} ficaram sem marcar: ${semRotina.map((x) => `${x.ps!.nome} (${x.titulos.slice(0, 2).join(", ")}${x.titulos.length > 2 ? "…" : ""})`).join("; ")}.${repetidos.length ? ` "${repetidos[0].titulo}" ficou sem marcar 3 ou mais vezes na semana${repetidos.length > 1 ? ` (e mais ${repetidos.length - 1} item(ns))` : ""}.` : ""}`,
      sugestao: repetidos.length ? "Rever o horário dessas rotinas." : "Lembrar de marcar a rotina.",
      acoes: [
        { tipo: "alertar", rotulo: "lembrar?", pessoas: semRotina.map((x) => x.ps!), titulo: "Rotina sem marcar", corpo: `Ficaram itens sem marcar na rotina de ${br(ontemUtil)}. Pode conferir e marcar o que foi feito?`, url: "/admin/rotinas" },
        ...(repetidos.length ? [{ tipo: "abrir" as const, rotulo: "mudar horário?", href: "/admin/rotinas" }] : []),
      ],
    });
  }

  /* ───────── 6) Atividades ───────── */
  const atrasadas = ats.filter((a) => atrasada(a, hoje)).sort((a, b) => a.prazo!.localeCompare(b.prazo!));
  if (atrasadas.length) {
    const porPessoa = new Map<string, LinhaAtividade[]>();
    for (const a of atrasadas) porPessoa.set(a.respId ?? "-", [...(porPessoa.get(a.respId ?? "-") ?? []), a]);
    add({
      id: "ativ-atrasadas",
      secao: "atividades",
      prioridade: "alta",
      fato: `${atrasadas.length} atividade(s) atrasada(s): ${[...porPessoa.entries()].map(([r, xs]) => `${nomeResp(r === "-" ? null : r)} ${xs.length}`).join(", ")}. A mais antiga é "${atrasadas[0].titulo}" (${nomeCli(atrasadas[0].clienteId)}), desde ${br(atrasadas[0].prazo!)}.`,
      sugestao: "Cobrar os responsáveis.",
      acoes: [...porPessoa.keys()]
        .filter((r) => r !== "-")
        .map((r) => pessoa(r))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .slice(0, 4)
        .map((ps) => {
          const xs = atrasadas.filter((a) => resp.get(a.respId ?? "")?.profileId === ps.profileId);
          return { tipo: "alertar" as const, rotulo: `cobrar ${ps.nome}?`, pessoas: [ps], titulo: `${xs.length} atividade(s) atrasada(s)`, corpo: `Estão atrasadas: ${xs.slice(0, 6).map((a) => `${a.titulo} (${nomeCli(a.clienteId)}, venceu ${br(a.prazo!)})`).join("; ")}.`, url: "/admin/activities" };
        }),
    });
  }
  const paradas = ats.filter((x) => aberta(x) && x.prazo && x.prazo >= hoje && x.prazo <= amanha && x.categoria !== "audiencia" && dias(x.atualizada, agora) >= 3);
  if (paradas.length) {
    const donos = [...new Set(paradas.map((a) => a.respId).filter((x): x is string => !!x))]
      .map((rid) => ({ rid, ps: pessoa(rid) }))
      .filter((x): x is { rid: string; ps: NonNullable<ReturnType<typeof pessoa>> } => !!x.ps)
      .slice(0, 3);
    add({
      id: "ativ-paradas",
      secao: "atividades",
      prioridade: "alta",
      fato: `${paradas.length} atividade(s) vencem hoje/amanhã e ninguém mexe nelas há 3+ dias: ${paradas.slice(0, 4).map((a) => `"${a.titulo}" (${nomeCli(a.clienteId)}, ${nomeResp(a.respId)}, parada há ${Math.floor(dias(a.atualizada, agora))} dias)`).join("; ")}${paradas.length > 4 ? "…" : ""}.`,
      sugestao: "Confirmar com o responsável ou dar nova data.",
      acoes: [
        { tipo: "mover_prazos", rotulo: "nova data?", itens: paradas.map((a) => ({ id: a.id, titulo: a.titulo, prazo: a.prazo! })), novaData: proximoDiaUtil(amanha) },
        ...donos.map(({ rid, ps }) => ({ tipo: "alertar" as const, rotulo: `cobrar ${ps.nome}?`, pessoas: [ps], titulo: "Atividades vencendo sem movimento", corpo: `Vencem hoje/amanhã e estão paradas: ${paradas.filter((a) => a.respId === rid).map((a) => a.titulo).join("; ")}.`, url: "/admin/activities" })),
      ],
    });
  }
  // redistribuição por carga
  const carga = equipe
    .map((r) => {
      const minhas = ats.filter((a) => a.respId === r.id && aberta(a));
      return { id: r.id, nome: curto(r.nome), areas: r.areas, carga: Math.round(minhas.reduce((s, a) => s + pesoAtividade(a, hoje), 0) * 10) / 10, abertas: minhas.length, atrasadas: minhas.filter((a) => atrasada(a, hoje)).length };
    })
    .sort((a, b) => b.carga - a.carga);
  const mediaCarga = carga.length ? carga.reduce((s, c) => s + c.carga, 0) / carga.length : 0;
  for (const sob of carga.filter((c) => c.carga > mediaCarga * 1.3 && c.abertas >= 4)) {
    const cand = ats.filter((a) => a.respId === sob.id && a.status === "aberta" && a.categoria !== "audiencia").sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"))[0];
    const ha60 = new Date(Date.now() - 60 * DIA).toISOString();
    const atuando = (rid: string) => ats.some((a) => a.respId === rid && (aberta(a) || a.criada >= ha60));
    // mesmo telefone = mesma pessoa (ex.: dois perfis do Maurício)
    const mesmaPessoa = (a: string, b: string) => !!telDe.get(a) && String(telDe.get(a)).replace(/D/g, "").slice(-8) === String(telDe.get(b) ?? "").replace(/D/g, "").slice(-8);
    const destino = cand && carga.filter((c) => c.id !== sob.id && !mesmaPessoa(c.id, sob.id) && atuando(c.id) && c.carga < sob.carga * 0.6 && (!cand.area || !c.areas.length || c.areas.includes(cand.area))).sort((x, y) => x.carga - y.carga)[0];
    if (!cand || !destino) continue;
    add({
      id: `redist-${cand.id}`,
      secao: "atividades",
      prioridade: "media",
      fato: `${sob.nome} está com carga ${sob.carga} (${sob.abertas} abertas, ${sob.atrasadas} atrasadas) e ${destino.nome} com ${destino.carga}.`,
      sugestao: `Passar "${cand.titulo}" (${nomeCli(cand.clienteId)}, ${TIPOS[cand.tipo] ?? cand.tipo}) para ${destino.nome}.`,
      acoes: [{ tipo: "reatribuir", rotulo: `passar para ${destino.nome}?`, activityId: cand.id, paraId: destino.id, paraNome: destino.nome }],
    });
  }

  /* ───────── 7) Distribuição ───────── */
  const d = m.distribuicao;
  if (d.pendentesAgora >= 20 || d.pendentesHaMaisDe2Dias >= 5) {
    const todos = equipe.map((r) => pessoa(r.id)).filter((x): x is NonNullable<typeof x> => !!x);
    add({
      id: "dist-volume",
      secao: "distribuicao",
      prioridade: d.pendentesHaMaisDe2Dias >= 10 ? "alta" : "media",
      fato: `Há ${d.pendentesAgora} itens esperando decisão na Distribuição, ${d.pendentesHaMaisDe2Dias} deles há mais de 2 dias (${d.porOrigem.filter((o) => o.pendente).map((o) => `${o.origem === "portal_cliente" ? "portal do cliente" : o.origem} ${o.pendente}`).join(", ")}). No período chegaram ${d.chegaram}, ${d.aceitas} aprovados e ${d.descartadas} descartados.`,
      sugestao: "Alertar a equipe sobre o volume.",
      acoes: [
        { tipo: "alertar", rotulo: "alertar equipe?", pessoas: todos, titulo: "Distribuição acumulada", corpo: `A Distribuição está com ${d.pendentesAgora} itens esperando decisão (${d.pendentesHaMaisDe2Dias} há mais de 2 dias). Vamos zerar hoje?`, url: "/admin/distribuicao" },
        { tipo: "abrir", rotulo: "abrir", href: "/admin/distribuicao" },
      ],
    });
  }

  /* ───────── 8) Publicações e andamentos ───────── */
  const prazosJud = ats.filter((a) => aberta(a) && a.categoria === "prazo" && a.prazo && a.prazo >= hoje && a.prazo <= amanha);
  for (const a of prazosJud.slice(0, 5))
    add({ id: `prazo-${a.id}`, secao: "publicacoes", prioridade: "alta", fato: `Prazo "${a.titulo}" (${nomeCli(a.clienteId)}, ${nomeResp(a.respId)}) vence ${a.prazo === hoje ? "hoje" : "amanhã"}.`, sugestao: "Tratar hoje.", acoes: [{ tipo: "abrir", rotulo: "tratar?", href: `/admin/activities/${a.id}` }] });
  const { data: pubs } = await db().from("publicacoes").select("id, numero_processo, tipo_comunicacao, client_id, created_at").eq("status", "nao_tratada").is("activity_id", null).order("created_at").limit(200);
  const pubsVelhas = ((pubs ?? []) as { id: string; numero_processo: string | null; tipo_comunicacao: string | null; client_id: string | null; created_at: string }[]).filter((x) => Date.now() - Date.parse(x.created_at) > 2 * DIA);
  if (pubsVelhas.length)
    add({ id: "pubs-paradas", secao: "publicacoes", prioridade: "alta", fato: `${pubsVelhas.length} publicação(ões) sem tratar há mais de 2 dias (a mais antiga há ${Math.floor((Date.now() - Date.parse(pubsVelhas[0].created_at)) / DIA)} dias).`, sugestao: "Tratar ou descartar.", acoes: [{ tipo: "abrir", rotulo: "tratar?", href: "/admin/publicacoes" }] });
  // (cliente perguntando + andamento novo já aparece na seção WhatsApp)

  /* ───────── 9) Atas ───────── */
  const { data: assin } = await db().from("ata_assinaturas").select("id, nome, enviado_em, ata_id, atas!inner(titulo, status, client_id)").eq("status", "pendente").not("enviado_em", "is", null);
  const porAta = new Map<string, { titulo: string; cid: string | null; pessoas: { id: string; nome: string; enviado: string }[] }>();
  for (const a of (assin ?? []) as unknown as { id: string; nome: string; enviado_em: string; ata_id: string; atas: { titulo: string; status: string; client_id: string | null } }[]) {
    if (a.atas.status !== "aguardando" || Date.now() - Date.parse(a.enviado_em) < 2 * DIA) continue;
    const v = porAta.get(a.ata_id) ?? { titulo: a.atas.titulo, cid: a.atas.client_id, pessoas: [] };
    v.pessoas.push({ id: a.id, nome: a.nome, enviado: a.enviado_em });
    porAta.set(a.ata_id, v);
  }
  for (const [ataId, v] of porAta)
    add({
      id: `ata-${ataId}`,
      secao: "atas",
      prioridade: "media",
      fato: `A ata "${v.titulo}"${v.cid ? ` (${nomeCli(v.cid)})` : ""} ainda não foi assinada por ${v.pessoas.map((x) => x.nome).join(", ")}; o link foi enviado há ${Math.floor((Date.now() - Date.parse(v.pessoas[0].enviado)) / DIA)} dias.`,
      sugestao: "Reenviar o link de assinatura.",
      acoes: [{ tipo: "lembrar_assinatura", rotulo: "lembrar?", assinaturas: v.pessoas.map((x) => ({ id: x.id, nome: x.nome })), ataTitulo: v.titulo }, { tipo: "abrir", rotulo: "abrir ata", href: `/admin/atas/${ataId}` }],
    });

  /* ───────── 10) Relatórios mensais ───────── */
  const [y, mm] = hoje.split("-").map(Number);
  const refMes = mm === 1 ? 12 : mm - 1;
  const refAno = mm === 1 ? y - 1 : y;
  if (Number(hoje.slice(8, 10)) >= 3) {
    const { data: rels } = await db().from("monthly_reports").select("client_id, sent_at").eq("reference_month", refMes).eq("reference_year", refAno);
    const comRel = new Map(((rels ?? []) as { client_id: string; sent_at: string | null }[]).map((r) => [r.client_id, r.sent_at]));
    const iniRef = new Date(`${refAno}-${String(refMes).padStart(2, "0")}-01T00:00:00-03:00`).toISOString();
    const fimRef = new Date(`${y}-${String(mm).padStart(2, "0")}-01T00:00:00-03:00`).toISOString();
    const comTrabalho = [...new Set(ats.filter((a) => a.clienteId && a.status === "concluida" && dentro(a.concluida, iniRef, fimRef)).map((a) => a.clienteId!))].filter((c) => !cli.get(c)?.pf);
    const semRel = comTrabalho.filter((c) => !comRel.has(c));
    const naoEnviados = [...comRel.entries()].filter(([, s]) => !s).map(([c]) => c);
    if (semRel.length || naoEnviados.length)
      add({
        id: "relatorios",
        secao: "relatorios",
        prioridade: "media",
        fato: `Relatório de ${String(refMes).padStart(2, "0")}/${refAno}: ${semRel.length ? `${semRel.length} empresa(s) com trabalho no mês ainda sem relatório (${semRel.slice(0, 4).map(nomeCli).join(", ")}${semRel.length > 4 ? "…" : ""})` : ""}${semRel.length && naoEnviados.length ? "; " : ""}${naoEnviados.length ? `${naoEnviados.length} gerado(s) e não enviado(s) (${naoEnviados.slice(0, 4).map(nomeCli).join(", ")})` : ""}.`,
        sugestao: semRel.length ? "Gerar os relatórios que faltam." : "Enviar os relatórios.",
        acoes: [...semRel.slice(0, 3).map((c) => ({ tipo: "abrir" as const, rotulo: `gerar ${curto(nomeCli(c))}?`, href: `/admin/reports/new?clientId=${c}` })), ...(naoEnviados.length ? [{ tipo: "abrir" as const, rotulo: "enviar?", href: "/admin/reports?enviado=nao" }] : [])],
      });
  }

  /* ───────── 11) Sistema ───────── */
  if (!m.sistema.agenteNoAr) add({ id: "sis-agente", secao: "sistema", prioridade: "alta", fato: "O Agente MC (WhatsApp) está fora do ar: mensagens e lembretes não estão saindo.", sugestao: "Verificar o celular/servidor do Agente.", acoes: [{ tipo: "abrir", rotulo: "ver", href: "/admin/whatsapp" }] });
  if (m.sistema.publicacoes?.erro) add({ id: "sis-pub", secao: "sistema", prioridade: "media", fato: `O robô de publicações deu erro na última rodada (${trecho(m.sistema.publicacoes.erro, 60)}).`, sugestao: "Conferir as publicações manualmente até voltar.", acoes: [{ tipo: "abrir", rotulo: "ver", href: "/admin/publicacoes" }] });
  if (m.sistema.andamentos?.erro) add({ id: "sis-and", secao: "sistema", prioridade: "media", fato: `A busca de andamentos do Astrea deu erro (${trecho(m.sistema.andamentos.erro, 60)}).`, sugestao: "", acoes: [] });

  const numeros = {
    periodo: p.rotulo,
    saude: m.saude,
    atividades: { criadas: m.atividades.criadas, criadasAnt: m.atividades.criadasAnt, concluidas: m.atividades.concluidas, concluidasAnt: m.atividades.concluidasAnt, abertas: m.atividades.abertas, atrasadas: m.atividades.atrasadas, noPrazoPct: m.atividades.noPrazoPct },
    concluidasPorPessoa: equipe.map((r) => `${curto(r.nome)}: ${ats.filter((a) => a.respId === r.id && a.status === "concluida" && dentro(a.concluida, p.ini, p.fim)).length}`),
    whatsapp: { respostaMedianaHoras: m.atendimento.respostaMedianaHoras, recebidas: m.atendimento.recebidas },
    satisfacao: m.satisfacao.media,
  };
  return { periodo: p, achados: out, numeros };
}
