import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { preferenciaDe } from "@/lib/notificacoes";
import { aplicarFormato } from "@/lib/notificacoes-tipos";
import { hojeBahia, periodoDe, somaDias } from "./base";
import { varrer, type AcaoGerente } from "./varredura";

export type { AcaoGerente } from "./varredura";

// O "gerente" do Painel do Dono (24/10/2026, estilo aprovado pelo usuário):
// texto corrido, sem seções, no tom de um assistente que fez a varredura do
// escritório — panorama, equipe (quem entregou, quem atrasou), o urgente,
// clientes, WhatsApp, gargalos e "se eu fosse começar…". Embaixo, a lista
// curta "o que fazer agora" com os mini-botões. Os números e nomes vêm da
// varredura (código); a IA (Flash-Lite, 1 chamada) só redige. Cache por
// período em painel_gerente (os que terminam "agora" valem 1 hora).

const db = () => createAdminClient() as unknown as SupabaseClient;
const VALIDADE_MS = 60 * 60 * 1000;
const MAURICIO = "ee479af5-6a30-4741-880a-c9e96ea0079b"; // perfil do Maurício (recebe o resumo das 7h)
const VERSAO = "v4";

export type FraseGerente = { texto: string; prioridade: "alta" | "media" | "baixa" | null; acoes: AcaoGerente[] };
export type Gerente = { paragrafos: string[]; fechamento: string; acoes: FraseGerente[]; geradoEm: string; periodo: string; pontos: number };

const SCHEMA = {
  type: "object",
  properties: {
    paragrafos: { type: "array", minItems: 5, maxItems: 8, items: { type: "string" } },
    fechamento: { type: "string", description: "o que fazer primeiro, começando por 'Se eu fosse começar por algum lugar, seria assim:'" },
    acoes: {
      type: "array",
      items: { type: "object", properties: { achado: { type: "string" }, frase: { type: "string", description: "até 12 palavras, verbo no início" } }, required: ["achado", "frase"] },
    },
  },
  required: ["paragrafos", "fechamento", "acoes"],
};

const SISTEMA = `Você é o assistente de gestão do escritório MC Advogados e acabou de fazer a varredura completa do sistema no período. Escreva para o dono, em português do Brasil, em TEXTO CORRIDO (sem títulos, sem tópicos, sem listas), com personalidade de assistente executivo de confiança: direto, analítico, humano, sem enrolação e sem elogios vazios. Trate o dono por "você".
"paragrafos" (5 a 8, cada um com 2 a 5 frases), nesta ordem natural:
1) Uma frase de abertura dizendo que fez a varredura do período e a saúde do escritório (ex.: "Fiz a varredura completa de outubro, e o escritório está operando a 52 de 100."). NÃO cumprimente (a saudação já aparece na tela).
2) O panorama: quanto entrou × quanto foi concluído (e a proporção), abertas, atrasadas, % no prazo, tempo do pedido à entrega — e o que isso significa.
3) A equipe, pessoa por pessoa: quem mais entregou (citando 1-3 títulos e clientes), nota/carga, quem tem atrasos e quantos, a atividade atrasada mais antiga, quem está sem demandas.
4) O mais urgente agora (prazos vencendo, coisas paradas), com nomes de clientes e responsáveis.
5) Clientes: quem mais demandou, satisfação média e os menos satisfeitos (com notas), entregas sem retorno ao cliente, onboardings pendentes, cadastros incompletos.
6) WhatsApp: volume, tempo de resposta, quem respondeu quanto, e quem está esperando resposta (com o motivo/trecho e há quanto tempo).
7) Gargalos e sistema: Distribuição, publicações, relatórios, robôs.
"fechamento": comece com "Se eu fosse começar por algum lugar, seria assim:" e liste em uma frase corrida as 4-6 ações mais importantes; termine dizendo o efeito esperado.
"acoes": para CADA achado recebido, uma frase curta de ação (até 12 palavras, verbo no início, com o nome do cliente/pessoa) e o id em "achado".
Use os números, nomes, títulos e trechos EXATAMENTE como vieram (com vírgula decimal e ponto de milhar: 2,7 e 1.443); não invente nada; se um dado não veio, não fale dele. Não use "ele/ela" nem "o/a" antes do nome de clientes. Seja RICO EM DETALHES: para cada pessoa da equipe diga concluídas, abertas, atrasadas e nota; diga a satisfação média; quem respondeu quanto no WhatsApp; relatórios feitos/enviados; robôs com erro.

EXEMPLO DE TOM E NÍVEL DE DETALHE (os dados do exemplo são de outro mês — NÃO os copie):
"Fiz a varredura completa de outubro, e o escritório está operando a 52 de 100."
"O ponto central do mês é que entrou muito mais trabalho do que saiu. Foram 49 atividades novas e só 10 concluídas, então de cada cinco que entraram, uma foi entregue. Hoje há 39 abertas e 16 já passaram do prazo, e só metade das entregas saiu dentro da data. Quando a entrega acontece, ela é rápida: em média 2,7 dias do pedido do cliente até a conclusão. O problema está no que fica parado, não na velocidade de quem executa."
"Na equipe, a Dra. Alice foi quem mais entregou: 8 atividades, quase todas da Sabor de Minas (homologações, rescisões pendentes, documento de alteração de horário). Mesmo assim tem a nota mais baixa do time (49), porque 3 das 9 que estão com ela atrasaram. Você concluiu 2 e tem a melhor nota (84), mas também a maior carga: 16 abertas e 5 atrasadas. A Dra. Francielle está com 10 abertas, 4 atrasadas e nenhuma concluída no mês. O Dr. Maurício tem 4 abertas, todas atrasadas, incluindo a mais antiga do escritório. A Talita segue sem nenhuma demanda."
"No WhatsApp a equipe está rápida: 1.443 mensagens recebidas, 601 enviadas e resposta mediana de 3 horas. Você respondeu 90 vezes, a Fran 62 e a Alice 9, e o número do escritório outras 413. A exceção que preocupa é a Renata Passos: 11 dias sem resposta, perguntando do processo, sendo que já chegou andamento novo para contar a ela."
"Se eu fosse começar por algum lugar, seria assim: destravar ou dar nova data às quatro da RM, responder a Renata com o andamento novo, avisar a Sabor de Minas das entregas, cobrar o Dr. Maurício e a Fran pelos atrasos, e reunir a equipe 15 minutos para zerar a Distribuição. Só isso já devolveria uns bons pontos à saúde do escritório."
Quem tem nota null está sem atividades: diga só que está sem demandas (nunca "nota nula"). O dono do escritório é Maurício Cardoso: quando a pessoa for ele, use "você".`;

/** Lê do cache ou monta a varredura + texto (1 chamada barata). */
export async function relatorioDoGerente(periodoId: string, { forcar = false } = {}): Promise<{ ok: true; gerente: Gerente } | { ok: false; error: string }> {
  const p = periodoDe(periodoId);
  const chave = `${VERSAO}|${p.id}|${p.ini.slice(0, 10)}`;
  const fechado = p.id === "ontem" || p.id === "mes-anterior";
  const { data: cache } = await db().from("painel_gerente").select("conteudo, created_at").eq("chave", chave).maybeSingle();
  if (cache && !forcar && (fechado || Date.now() - Date.parse(cache.created_at as string) < VALIDADE_MS)) return { ok: true, gerente: cache.conteudo as Gerente };

  const { achados, numeros } = await varrer(p.id);
  const r = await generateJson<{ paragrafos: string[]; fechamento: string; acoes: { achado: string; frase: string }[] }>({
    model: MODELOS.assistente,
    system: SISTEMA,
    parts: [{ text: JSON.stringify({ numeros, achados: achados.map((a) => ({ id: a.id, area: a.secao, prioridade: a.prioridade, fato: a.fato, sugestao: a.sugestao })) }) }],
    schema: SCHEMA,
  });
  if (!r.ok && cache) return { ok: true, gerente: cache.conteudo as Gerente };

  const frase = new Map((r.ok ? r.data.acoes : []).map((x) => [x.achado, x.frase]));
  const ordem = { alta: 0, media: 1, baixa: 2 };
  const acoes: FraseGerente[] = achados
    .filter((a) => a.acoes.length)
    .sort((x, y) => ordem[x.prioridade] - ordem[y.prioridade])
    .map((a) => ({ texto: frase.get(a.id) || a.sugestao || a.fato, prioridade: a.prioridade, acoes: a.acoes }));
  const gerente: Gerente = {
    paragrafos: r.ok ? r.data.paragrafos.filter(Boolean) : achados.map((a) => `${a.fato}${a.sugestao ? ` ${a.sugestao}` : ""}`),
    fechamento: r.ok ? r.data.fechamento : "",
    acoes,
    geradoEm: new Date().toISOString(),
    periodo: p.rotulo,
    pontos: achados.length,
  };
  await db().from("painel_gerente").upsert({ chave, conteudo: gerente, created_at: gerente.geradoEm });
  return { ok: true, gerente };
}

/** Texto corrido (WhatsApp das 7h e Assistente). */
export function gerenteEmTexto(g: Gerente, { negrito = true } = {}) {
  const b = (t: string) => (negrito ? `*${t}*` : t);
  const bola = { alta: "🔴", media: "🟡", baixa: "⚪" } as const;
  return [
    ...g.paragrafos.flatMap((t) => [t, ""]),
    ...(g.fechamento ? [b(g.fechamento), ""] : []),
    ...(g.acoes.length ? [b("O que fazer agora:"), ...g.acoes.slice(0, 10).map((f) => `${f.prioridade ? bola[f.prioridade] : "•"} ${f.texto}`), ""] : []),
  ].join("\n");
}

/**
 * Cron das 7h: o gerente manda no WhatsApp do Maurício a varredura de ONTEM
 * (os botões ficam no painel; vai o link). 1 vez por dia.
 */
export async function enviarGerenteDoDia(): Promise<string> {
  const dia = hojeBahia();
  const { data: ja } = await db().from("painel_sugestoes").select("enviado_em").eq("dia", dia).maybeSingle();
  if (ja?.enviado_em) return "já enviado hoje";
  const r = await relatorioDoGerente("ontem");
  if (!r.ok) return `erro: ${r.error}`;
  const { data: resp } = await db().from("responsaveis").select("telefone").eq("profile_id", MAURICIO).maybeSingle();
  const telefone = String(resp?.telefone ?? "").replace(/\D/g, "");
  if (telefone.length < 10) return "sem telefone do Maurício em Responsáveis";
  const pref = await preferenciaDe(MAURICIO, "resumos_painel", "zap");
  if (!pref.ativo) return "desligado em Minha conta › Notificações";
  const ontem = somaDias(dia, -1).split("-").reverse().slice(0, 2).join("/");
  const texto = [`*Bom dia, Maurício! Aqui está o resumo de ontem (${ontem}).*`, "", gerenteEmTexto(r.gerente), "Para resolver com um clique: mcadvogados.app.br/admin/painel?p=ontem"].join("\n");
  const job = await enfileirarMensagem({ para: telefone, texto: aplicarFormato(texto, pref.formato), origemRef: `painel-gerente:${dia}`, expiraEm: new Date(Date.now() + 12 * 3_600_000) });
  if (!job) return "falha ao enfileirar";
  await db().from("painel_sugestoes").upsert({ dia, texto: JSON.stringify({ resumo: r.gerente.paragrafos[0] ?? "", itens: [] }), metricas: { origem: "gerente", pontos: r.gerente.pontos }, enviado_em: new Date().toISOString() });
  return "enviado";
}
