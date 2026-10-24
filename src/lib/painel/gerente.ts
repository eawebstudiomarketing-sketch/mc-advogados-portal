import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { hojeBahia, periodoDe, somaDias } from "./base";
import { SECOES, varrer, type AcaoGerente, type SecaoId } from "./varredura";

export type { AcaoGerente } from "./varredura";

// O "gerente" do Painel do Dono (24/10/2026): passa a varredura do sistema
// (varredura.ts, tudo em código) para o dono em texto corrido, seção por
// seção, com a sugestão e o mini-botão de ação junto de cada ponto. A IA
// (Flash-Lite, 1 chamada) só redige; cada período fica guardado em
// painel_gerente (os que terminam "agora" valem 1 hora).

const db = () => createAdminClient() as unknown as SupabaseClient;
const VALIDADE_MS = 60 * 60 * 1000;
const MAURICIO = "ee479af5-6a30-4741-880a-c9e96ea0079b"; // perfil do Maurício (recebe o resumo das 7h)
const VERSAO = "v2";

export type FraseGerente = { texto: string; prioridade: "alta" | "media" | "baixa" | null; acoes: AcaoGerente[] };
export type SecaoGerente = { id: SecaoId; titulo: string; frases: FraseGerente[]; pontos: number };
export type Gerente = { abertura: string[]; secoes: SecaoGerente[]; geradoEm: string; periodo: string; pontos: number };

const SCHEMA = {
  type: "object",
  properties: {
    abertura: { type: "array", maxItems: 3, items: { type: "string" }, description: "panorama do período em 2-3 frases curtas" },
    secoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          frases: { type: "array", items: { type: "object", properties: { texto: { type: "string" }, achado: { type: "string", description: "id do achado desta frase" } }, required: ["texto", "achado"] } },
        },
        required: ["id", "frases"],
      },
    },
  },
  required: ["abertura", "secoes"],
};

const SISTEMA = `Você é o gerente do escritório MC Advogados passando ao dono a varredura do sistema no período. Português do Brasil, tom de gerente de confiança: direto, concreto, sem enrolação, sem elogios.
"abertura": 2-3 frases com o panorama (números do período, comparação com o período anterior quando houver).
"secoes": para cada seção recebida, frases que contam o que foi encontrado E já trazem a sugestão no mesmo texto ("…; sugiro marcar a reunião de onboarding", "…; vale responder com o andamento novo"). Cada achado vira UMA frase (informe o id dele em "achado"); use TODOS os achados, sem repetir. NÃO resuma o fato: mantenha todos os detalhes (o que falta, nomes, quantidades, dias, datas, títulos de atividades e o trecho da mensagem do cliente entre aspas), exatamente como vieram; só deixe o texto fluido e acrescente a sugestão no fim. Não invente nada. Não use "ele/ela" nem "o/a" antes do nome de clientes.`;

/** Lê do cache ou monta a varredura + texto (1 chamada barata). */
export async function relatorioDoGerente(periodoId: string, { forcar = false } = {}): Promise<{ ok: true; gerente: Gerente } | { ok: false; error: string }> {
  const p = periodoDe(periodoId);
  const chave = `${VERSAO}|${p.id}|${p.ini.slice(0, 10)}`;
  const fechado = p.id === "ontem" || p.id === "mes-anterior";
  const { data: cache } = await db().from("painel_gerente").select("conteudo, created_at").eq("chave", chave).maybeSingle();
  if (cache && !forcar && (fechado || Date.now() - Date.parse(cache.created_at as string) < VALIDADE_MS)) return { ok: true, gerente: cache.conteudo as Gerente };

  const { achados, numeros } = await varrer(p.id);
  const porSecao = SECOES.map((s) => ({ ...s, achados: achados.filter((a) => a.secao === s.id) })).filter((s) => s.achados.length);
  const r = await generateJson<{ abertura: string[]; secoes: { id: string; frases: { texto: string; achado: string }[] }[] }>({
    model: MODELOS.assistente,
    system: SISTEMA,
    parts: [{ text: JSON.stringify({ numeros, secoes: porSecao.map((s) => ({ id: s.id, titulo: s.titulo, achados: s.achados.map((a) => ({ id: a.id, prioridade: a.prioridade, fato: a.fato, sugestao: a.sugestao })) })) }) }],
    schema: SCHEMA,
  });
  if (!r.ok && cache) return { ok: true, gerente: cache.conteudo as Gerente };

  const porId = new Map(achados.map((a) => [a.id, a]));
  const secoes: SecaoGerente[] = porSecao.map((s) => {
    const usados = new Set<string>();
    const frases: FraseGerente[] = [];
    for (const f of (r.ok ? r.data.secoes.find((x) => x.id === s.id)?.frases : null) ?? []) {
      const a = porId.get(f.achado);
      if (a && a.secao === s.id && !usados.has(a.id)) {
        usados.add(a.id);
        frases.push({ texto: f.texto, prioridade: a.prioridade, acoes: a.acoes });
      }
    }
    // o que a IA deixou de fora (ou sem IA): frase montada em código
    for (const a of s.achados) if (!usados.has(a.id)) frases.push({ texto: `${a.fato}${a.sugestao ? ` Sugestão: ${a.sugestao.charAt(0).toLowerCase()}${a.sugestao.slice(1)}` : ""}`, prioridade: a.prioridade, acoes: a.acoes });
    const ordem = { alta: 0, media: 1, baixa: 2 };
    frases.sort((x, y) => ordem[x.prioridade ?? "baixa"] - ordem[y.prioridade ?? "baixa"]);
    return { id: s.id, titulo: s.titulo, frases, pontos: s.achados.length };
  });
  const gerente: Gerente = {
    abertura: r.ok ? r.data.abertura.filter(Boolean).slice(0, 3) : [`${numeros.periodo}: ${numeros.atividades.criadas} atividades criadas e ${numeros.atividades.concluidas} concluídas; ${numeros.atividades.atrasadas} atrasadas.`],
    secoes,
    geradoEm: new Date().toISOString(),
    periodo: p.rotulo,
    pontos: achados.length,
  };
  await db().from("painel_gerente").upsert({ chave, conteudo: gerente, created_at: gerente.geradoEm });
  return { ok: true, gerente };
}

/** Texto corrido da varredura (WhatsApp das 7h e Assistente). */
export function gerenteEmTexto(g: Gerente, { negrito = true } = {}) {
  const b = (t: string) => (negrito ? `*${t}*` : t);
  const bola = { alta: "🔴", media: "🟡", baixa: "⚪" } as const;
  return [...g.abertura, "", ...g.secoes.flatMap((s) => [b(s.titulo), ...s.frases.map((f) => `${f.prioridade ? bola[f.prioridade] : "•"} ${f.texto}`), ""])].join("\n");
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
  const ontem = somaDias(dia, -1).split("-").reverse().slice(0, 2).join("/");
  const texto = [`*Bom dia, Maurício! Varredura de ontem (${ontem})*`, "", gerenteEmTexto(r.gerente), "Para resolver com um clique: mcadvogados.app.br/admin/painel?p=ontem"].join("\n");
  const job = await enfileirarMensagem({ para: telefone, texto, origemRef: `painel-gerente:${dia}`, expiraEm: new Date(Date.now() + 12 * 3_600_000) });
  if (!job) return "falha ao enfileirar";
  await db().from("painel_sugestoes").upsert({ dia, texto: JSON.stringify({ resumo: r.gerente.abertura.join(" "), itens: [] }), metricas: { origem: "gerente", pontos: r.gerente.pontos }, enviado_em: new Date().toISOString() });
  return "enviado";
}
