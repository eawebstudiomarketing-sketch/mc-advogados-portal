import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient as adminTipado } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { preferenciaDe } from "@/lib/notificacoes";
import { aplicarFormato } from "@/lib/notificacoes-tipos";
import { calcularMetricas, periodoDe, resumoParaIa } from "./metricas";

// Sugestões do dia do Painel do Dono (24/10/2026). Gasto mínimo: os números
// já vêm prontos (metricas.ts) e vão resumidos (~1 mil tokens); 1 chamada ao
// Flash-Lite por dia, guardada em painel_sugestoes. Custo ≈ R$ 0,005/dia.

const createAdminClient = () => adminTipado() as unknown as SupabaseClient; // painel_sugestoes ainda não está nos tipos gerados
const MAURICIO = "ee479af5-6a30-4741-880a-c9e96ea0079b"; // perfil do Maurício (admin máximo)
const hojeBahia = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });

export type Sugestao = { titulo: string; acao: string; prioridade: "alta" | "media" | "baixa" };
export type SugestoesDoDia = { dia: string; itens: Sugestao[]; resumo: string; enviado_em: string | null; created_at: string };

const SCHEMA = {
  type: "object",
  properties: {
    resumo: { type: "string", description: "1 frase sobre como o escritório está hoje" },
    itens: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          acao: { type: "string", description: "o que fazer hoje, concreto, citando nomes" },
          prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
        },
        required: ["titulo", "acao", "prioridade"],
      },
    },
  },
  required: ["resumo", "itens"],
};

const SISTEMA = `Você é o consultor de gestão do escritório MC Advogados. Recebe os números do mês (já calculados) e escreve no máximo 5 sugestões do que melhorar HOJE, em português do Brasil, diretas, citando clientes/pessoas pelo nome quando houver. Priorize: clientes esperando resposta, atividades atrasadas ou paradas, clientes esfriando ou insatisfeitos, inadimplência, robôs com erro. Não invente números nem fatos. Só diga quem deve fazer algo quando o responsável aparecer no próprio dado (ex.: atividade parada com responsável); senão, não atribua a ninguém. Sem elogios genéricos.`;

export async function sugestoesDoDia(dia = hojeBahia()): Promise<SugestoesDoDia | null> {
  const { data } = await createAdminClient().from("painel_sugestoes").select("dia, texto, enviado_em, created_at").eq("dia", dia).maybeSingle();
  if (!data) return null;
  const j = JSON.parse(data.texto) as { resumo: string; itens: Sugestao[] };
  return { dia: data.dia, itens: j.itens, resumo: j.resumo, enviado_em: data.enviado_em, created_at: data.created_at };
}

/** Gera (ou devolve a já gerada hoje). `refazer` troca a de hoje — limitado a 3 por dia na tela. */
export async function gerarSugestoes({ refazer = false } = {}): Promise<{ ok: true; sugestoes: SugestoesDoDia } | { ok: false; error: string }> {
  const dia = hojeBahia();
  if (!refazer) {
    const ja = await sugestoesDoDia(dia);
    if (ja) return { ok: true, sugestoes: ja };
  }
  const m = await calcularMetricas(periodoDe("mes"));
  const resumo = resumoParaIa(m);
  const r = await generateJson<{ resumo: string; itens: Sugestao[] }>({
    model: MODELOS.assistente, funcao: "painel_sugestoes",
    system: SISTEMA,
    parts: [{ text: JSON.stringify(resumo) }],
    schema: SCHEMA,
  });
  if (!r.ok) return r;
  const db = createAdminClient();
  const { data: velho } = await db.from("painel_sugestoes").select("metricas").eq("dia", dia).maybeSingle();
  const refeitas = Number((velho?.metricas as { refeitas?: number } | null)?.refeitas ?? -1) + 1;
  const { data, error } = await db
    .from("painel_sugestoes")
    .upsert({ dia, texto: JSON.stringify({ resumo: r.data.resumo, itens: r.data.itens.slice(0, 5) }), metricas: { ...resumo, refeitas }, enviado_em: null, created_at: new Date().toISOString() })
    .select("dia, enviado_em, created_at")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, sugestoes: { dia: data.dia, itens: r.data.itens.slice(0, 5), resumo: r.data.resumo, enviado_em: data.enviado_em, created_at: data.created_at } };
}

/** Quantas vezes a de hoje já foi refeita (limite da tela). */
export async function vezesRefeitasHoje(): Promise<number> {
  const { data } = await createAdminClient().from("painel_sugestoes").select("metricas").eq("dia", hojeBahia()).maybeSingle();
  return Number((data?.metricas as { refeitas?: number } | null)?.refeitas ?? 0);
}

/** Cron das 7h: gera as do dia e manda no WhatsApp do Maurício (uma vez só). */
export async function enviarSugestoesDoDia(): Promise<string> {
  const r = await gerarSugestoes();
  if (!r.ok) return `erro: ${r.error}`;
  if (r.sugestoes.enviado_em) return "já enviado hoje";
  const db = createAdminClient();
  const { data: resp } = await db.from("responsaveis").select("telefone").eq("profile_id", MAURICIO).maybeSingle();
  const telefone = (resp?.telefone ?? "").replace(/\D/g, "");
  if (telefone.length < 10) return "sem telefone do Maurício em Responsáveis";
  const pref = await preferenciaDe(MAURICIO, "resumos_painel", "zap");
  if (!pref.ativo) return "desligado em Minha conta › Notificações";
  const emoji = { alta: "🔴", media: "🟡", baixa: "🟢" } as const;
  const texto = [
    `*Painel do Dono — sugestões de hoje*`,
    r.sugestoes.resumo,
    "",
    ...r.sugestoes.itens.map((s, i) => `${emoji[s.prioridade] ?? "•"} *${i + 1}. ${s.titulo}*\n${s.acao}`),
    "",
    "Detalhes: mcadvogados.app.br/admin/painel",
  ].join("\n");
  const job = await enfileirarMensagem({ para: telefone, texto: aplicarFormato(texto, pref.formato), origemRef: `painel-sugestoes:${r.sugestoes.dia}`, expiraEm: new Date(Date.now() + 12 * 3_600_000) });
  if (!job) return "falha ao enfileirar";
  await db.from("painel_sugestoes").update({ enviado_em: new Date().toISOString() }).eq("dia", r.sugestoes.dia);
  return "enviado";
}
