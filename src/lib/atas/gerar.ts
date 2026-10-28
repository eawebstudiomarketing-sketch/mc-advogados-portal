import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { executarTranscricao, perguntarIA } from "@/lib/transcricao";
import { dataHoraBr, hms, PAPEL_ROTULO, TIPOS_ATA, type Alerta, type Marcacao, type Participante, type TipoAta } from "./formato";

// Da gravação à ata: transcreve (com tempo e separando quem fala, usando os
// nomes dos participantes como pista), a IA escreve a ata no modelo do tipo
// escolhido e uma segunda leitura confere a ata contra a transcrição.

const db = () => createAdminClient() as unknown as SupabaseClient;

export type AtaRow = {
  id: string;
  profile_id: string;
  client_id: string | null;
  transcricao_id: string | null;
  tipo: TipoAta;
  titulo: string;
  data_reuniao: string;
  local: string | null;
  pauta: string | null;
  participantes: Participante[];
  marcacoes: Marcacao[];
  status: string;
  texto: string | null;
};

function contexto(ata: AtaRow, cliente: string | null): string {
  const pessoas = ata.participantes.map((p) => `${p.nome}${p.cargo ? ` (${p.cargo})` : ""}, ${PAPEL_ROTULO[p.papel].toLowerCase()}`).join("; ");
  return [
    `${TIPOS_ATA[ata.tipo].titulo} do escritório MC Advogados${cliente ? ` com o cliente ${cliente}` : ""}, em ${dataHoraBr(ata.data_reuniao)}.`,
    pessoas ? `Participantes: ${pessoas}.` : "",
    ata.pauta ? `Pauta: ${ata.pauta}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const SISTEMA_ATA = `Você redige atas de reunião para o escritório de advocacia MC Advogados, a partir da transcrição da reunião.

Regras:
- registre só o que foi dito: não invente, não suponha, não opine; o que ficou vago vai como foi dito, com "(a confirmar)" no fim;
- linguagem formal, objetiva, em terceira pessoa e em frases completas, no estilo de ata ("O cliente informou que…", "Ficou acordado que…");
- mantenha nomes, valores, datas, prazos, números de processo e documentos exatamente como foram ditos;
- não acrescente qualificações nem detalhes que não foram ditos (ex.: se disseram só "multa", não escreva "multa rescisória");
- use os nomes dos participantes quando der para saber quem falou; se não der, "o cliente", "o advogado", "a equipe";
- cada item, parágrafo ou linha "Rótulo:" termina com o tempo em que aquilo foi dito na transcrição, no formato [HH:MM:SS] (o início da fala correspondente), depois da pontuação final e uma vez só por linha;
- omita seções e subseções que ficariam vazias;
- NÃO escreva título, identificação, data nem lista de participantes: isso é gerado à parte.

Formato (texto simples, uma informação por linha, sem markdown além disto):
# Título da seção
## Subseção
• item
1. Item numerado
Rótulo: valor`;

/** Escreve a ata a partir da transcrição. */
export async function escreverAta(ata: AtaRow, cliente: string | null, transcricao: string): Promise<string> {
  const modelo = TIPOS_ATA[ata.tipo];
  const marcados = ata.marcacoes.length
    ? `\n\nMomentos marcados pela equipe durante a reunião (dê prioridade a eles):\n${ata.marcacoes.map((m) => `[${hms(m.seg)}] ${m.tipo === "decisao" ? "DECISÃO" : "IMPORTANTE"}`).join("\n")}`
    : "";
  const pedido = `${contexto(ata, cliente)}

Seções da ata, nesta ordem (as instruções entre parênteses são para você, não copie):
${modelo.secoes}${marcados}

Transcrição da reunião (com o tempo de cada fala):
${transcricao}`;
  const r = await perguntarIA(SISTEMA_ATA, pedido);
  const texto = r
    .replace(/^```\w*\n?|```$/g, "")
    .replace(/\*\*/g, "")
    .split("\n")
    .filter((l) => !/^#\s*(\d+\.\s*)?identifica/i.test(l.trim()))
    .join("\n")
    .trim();
  if (!texto) throw new Error("A IA não devolveu a ata. Tente de novo.");
  return texto;
}

const SISTEMA_CONFERENCIA = `Você confere atas de reunião de um escritório de advocacia contra a transcrição da reunião. Procure dois tipos de problema:
- "nao_dito": algo que está na ata mas NÃO foi dito na transcrição, ou foi dito de outro jeito (valor, data, prazo, nome, quem disse ou decisão diferentes);
- "faltou": decisão, prazo, valor, tarefa combinada ou documento pedido que foi dito na transcrição e ficou FORA da ata.
Ignore diferenças de estilo e resumos fiéis. Responda SÓ com um JSON: uma lista (pode ser vazia) de objetos {"tipo": "nao_dito"|"faltou", "texto": "o trecho da ata (nao_dito) ou o que foi dito (faltou), curto", "motivo": "explicação curta", "minuto": "HH:MM:SS ou null"}. No máximo 12 itens, os mais importantes primeiro.`;

/** Segunda leitura: o que a ata diz e não foi dito, e o que foi dito e ficou fora. */
export async function conferirAta(texto: string, transcricao: string): Promise<Alerta[]> {
  try {
    const r = await perguntarIA(SISTEMA_CONFERENCIA, `ATA:\n${texto}\n\nTRANSCRIÇÃO:\n${transcricao}`);
    const json = r.slice(r.indexOf("["), r.lastIndexOf("]") + 1);
    const lista = JSON.parse(json) as Alerta[];
    return lista
      .filter((a) => (a.tipo === "nao_dito" || a.tipo === "faltou") && a.texto)
      .slice(0, 12)
      .map((a) => ({ tipo: a.tipo, texto: String(a.texto).slice(0, 400), motivo: String(a.motivo ?? "").slice(0, 400), minuto: a.minuto && /^\d{1,2}:\d{2}(:\d{2})?$/.test(a.minuto) ? a.minuto : null }));
  } catch (e) {
    console.error("conferência da ata:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Nome do cliente da reunião (para o contexto da IA). */
async function nomeDoCliente(clientId: string | null): Promise<string | null> {
  if (!clientId) return null;
  const { data } = await db().from("clients").select("name").eq("id", clientId).maybeSingle();
  return (data as { name: string } | null)?.name ?? null;
}

/**
 * Etapa 1 — a reunião: transcreve (fiel, com tempo e quem fala) e resume com IA,
 * numa passada só. processando → transcrita (reunião entregue), ou erro.
 * Não escreve a ata: isso é a etapa 2, pedida pelo botão "Gerar ata".
 */
export async function processarReuniao(ataId: string): Promise<void> {
  const { data: ata } = await db().from("atas").select("*").eq("id", ataId).single<AtaRow>();
  if (!ata?.transcricao_id) throw new Error("Reunião sem gravação.");
  await db().from("atas").update({ status: "processando", erro: null, updated_at: new Date().toISOString() }).eq("id", ataId);
  try {
    const cliente = await nomeDoCliente(ata.client_id);
    const { data: t } = await db().from("transcricoes").select("status, texto, resumo, duracao_seg, titulo").eq("id", ata.transcricao_id).single();
    if (t?.status !== "pronta" || !t.texto?.trim()) {
      const r = await executarTranscricao(ata.transcricao_id, {
        modo: "ambos",
        opcoes: { falantes: true, tempo: true },
        duracao: t?.duracao_seg ?? 0,
        nome: t?.titulo ?? ata.titulo,
        contexto: contexto(ata, cliente),
        manterAudio: true, // o player da revisão da ata usa; apaga ao aprovar ou ao excluir
      });
      if (!r.texto?.trim()) throw new Error("A gravação ficou sem fala para transcrever.");
    }
    await db().from("atas").update({ status: "transcrita", updated_at: new Date().toISOString() }).eq("id", ataId);
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Falha ao transcrever a reunião.";
    console.error("reunião:", ataId, erro);
    await db().from("atas").update({ status: "erro", erro }).eq("id", ataId);
    throw new Error(erro);
  }
}

/**
 * Etapa 2 — a ata: escreve a partir da transcrição já pronta e confere.
 * gerando → rascunho. Se falhar, a reunião continua entregue (volta para
 * transcrita com o motivo) e dá para tentar de novo.
 */
export async function processarAta(ataId: string): Promise<void> {
  const { data: ata } = await db().from("atas").select("*").eq("id", ataId).single<AtaRow>();
  if (!ata?.transcricao_id) throw new Error("Ata sem gravação.");
  await db().from("atas").update({ status: "gerando", erro: null, updated_at: new Date().toISOString() }).eq("id", ataId);
  try {
    const cliente = await nomeDoCliente(ata.client_id);
    const { data: t } = await db().from("transcricoes").select("status, texto").eq("id", ata.transcricao_id).single();
    const transcricao = t?.status === "pronta" ? t.texto : null;
    if (!transcricao?.trim()) throw new Error("A reunião ainda não foi transcrita.");
    const texto = await escreverAta(ata, cliente, transcricao);
    const alertas = await conferirAta(texto, transcricao);
    await db().from("atas").update({ status: "rascunho", texto, alertas, updated_at: new Date().toISOString() }).eq("id", ataId);
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Falha ao gerar a ata.";
    console.error("ata:", ataId, erro);
    await db().from("atas").update({ status: "transcrita", erro }).eq("id", ataId);
    throw new Error(erro);
  }
}
