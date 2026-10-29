import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import type { Indicadores } from "./individual";

// Resumo com IA dos Indicadores de UMA pessoa (28/10/2026): "você fez isso,
// pecou nisso, recomendo aquilo". Gasto mínimo: os números já vêm prontos (código),
// a IA só redige — 1 chamada barata, guardada por pessoa+período em painel_gerente
// (períodos fechados valem para sempre; os que terminam "agora", 1 hora).
// Cada pessoa só recebe o próprio resumo; o texto nunca cita outra pessoa.

const db = () => createAdminClient() as unknown as SupabaseClient;
const VALIDADE_MS = 60 * 60 * 1000;
const VERSAO = "ind-v1";

export type ResumoPessoa = { paragrafos: string[]; recomendacoes: string[]; geradoEm: string; periodo: string };

const SCHEMA = {
  type: "object",
  properties: {
    paragrafos: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    recomendacoes: { type: "array", minItems: 2, maxItems: 5, items: { type: "string", description: "uma ação concreta, verbo no início, até 20 palavras" } },
  },
  required: ["paragrafos", "recomendacoes"],
};

const SISTEMA = `Você é o assistente de desempenho do escritório MC Advogados e escreve, em português do Brasil, o retrato do período de UMA pessoa da equipe, falando diretamente com ela ("você"). Tom: direto, honesto e construtivo, de colega experiente; sem bajular e sem humilhar.

Escreva "paragrafos" (3 a 5, cada um com 2 a 4 frases) nesta ordem:
1) Abertura: o período e o quadro geral (nota de 0 a 100 quando existir; se a nota for null, diga que ainda não há atividades para avaliar).
2) O que você fez: entregas do período (quantas, no prazo, tempo até concluir), citando 2 a 4 títulos/clientes de "entreguesLista", e o que foi designado a você.
3) Onde pecou / pontos de atenção: atrasos (quantos e a mais antiga, com título e cliente), atividades paradas há muito tempo, demora para responder no WhatsApp (mediana acima de 4 h é lenta; até 2 h é boa), publicações e andamentos novos sem tratar. Só fale do que os números mostram.
4) Processos, publicações e andamentos: o que você tratou e o que está pendente nos seus processos.
"recomendacoes" (2 a 5): ações concretas e priorizadas para a próxima semana, com títulos/clientes quando houver.

Regras: use os números, títulos e nomes EXATAMENTE como vieram (vírgula decimal e ponto de milhar: 2,7 e 1.443); não invente nada; se um dado não veio ou é zero, não invente nem dramatize; NUNCA cite nem compare com outras pessoas ou com a média do escritório; não use "ele/ela"; não escreva títulos nem markdown; frases curtas.`;

export async function resumoDaPessoa(ind: Indicadores, { forcar = false } = {}): Promise<{ ok: true; resumo: ResumoPessoa } | { ok: false; error: string }> {
  const p = ind.periodo;
  const chave = `${VERSAO}|${ind.pessoa.id}|${p.id}|${p.ini.slice(0, 10)}`;
  const fechado = p.id === "ontem" || p.id === "mes-anterior";
  const { data: cache } = await db().from("painel_gerente").select("conteudo, created_at").eq("chave", chave).maybeSingle();
  if (cache && !forcar && (fechado || Date.now() - Date.parse(cache.created_at as string) < VALIDADE_MS)) return { ok: true, resumo: cache.conteudo as ResumoPessoa };

  const a = ind.atividades;
  const dados = {
    periodo: p.rotulo,
    nota: ind.nota,
    atividades: {
      designadas: a.designadas,
      designadasPeriodoAnterior: a.designadasAnt,
      entregues: a.entregues,
      entreguesPeriodoAnterior: a.entreguesAnt,
      abertasAgora: a.abertas,
      atrasadasAgora: a.atrasadas,
      entreguesNoPrazoPct: a.noPrazoPct,
      tempoMedianoAteConcluirDias: a.tempoMedianoDias,
      entreguesLista: a.entreguesLista.map((x) => ({ titulo: x.titulo, cliente: x.cliente, dias: x.dias })),
      atrasadasLista: a.atrasadasLista.map((x) => ({ titulo: x.titulo, cliente: x.cliente, diasDeAtraso: x.diasAtraso })),
      maisAntigasAbertas: a.maisAntigas.map((x) => ({ titulo: x.titulo, cliente: x.cliente, diasAberta: x.dias })),
    },
    whatsapp: { respostasEnviadas: ind.whatsapp.respostas, conversasRespondidas: ind.whatsapp.respondidas, tempoMedianoDeRespostaHoras: ind.whatsapp.medianaHoras },
    trabalho: ind.trabalho,
    processos: ind.processos,
  };
  const r = await generateJson<{ paragrafos: string[]; recomendacoes: string[] }>({
    model: MODELOS.assistente,
    system: SISTEMA,
    parts: [{ text: JSON.stringify(dados) }],
    schema: SCHEMA,
  });
  if (!r.ok) {
    if (cache) return { ok: true, resumo: cache.conteudo as ResumoPessoa };
    return { ok: false, error: "A IA não respondeu agora. Tente de novo em instantes." };
  }
  const resumo: ResumoPessoa = { paragrafos: r.data.paragrafos.filter(Boolean), recomendacoes: r.data.recomendacoes.filter(Boolean), geradoEm: new Date().toISOString(), periodo: p.rotulo };
  await db().from("painel_gerente").upsert({ chave, conteudo: resumo, created_at: resumo.geradoEm });
  return { ok: true, resumo };
}
