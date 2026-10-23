import "server-only";
import { createHmac } from "node:crypto";
import { ApiError, GoogleGenAI, ThinkingLevel, type File as ArquivoGemini } from "@google/genai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELOS } from "@/lib/ia-modelos";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_WHATSAPP, linkVps } from "@/lib/whatsapp";
import type { ModoTranscricao, OpcoesTranscricao } from "@/lib/transcricao-formato";

// Transcrição de áudio (aba Transcrição, 22/10/2026). O navegador manda o
// arquivo direto pro VPS (o Storage do Supabase só aceita até 50 MB), que
// converte em áudio leve e mede a duração. Aqui: baixa do VPS, sobe na API de
// arquivos do Gemini e transcreve em trechos de 15 min EM PARALELO (uma
// reunião de 3 h termina em ~1–2 min, dentro do limite da função). O resumo
// sai do texto transcrito (ou direto do áudio, no modo só resumo).

const TRECHO_SEG = 15 * 60;
const UM_TRECHO_ATE = 20 * 60; // até 20 min vai inteiro
const PARALELO = 8;

/* ───────── VPS: links assinados ───────── */

function assinar(acao: "" | "up:" | "del:", caminho: string, segundos: number) {
  const base = process.env.WA_MIDIA_URL;
  const segredo = process.env.WA_MIDIA_SEGREDO;
  if (!base || !segredo) throw new Error("O servidor de mídia (WA_MIDIA_URL) não está configurado.");
  const expira = Math.floor(Date.now() / 1000) + segundos;
  const s = createHmac("sha256", segredo).update(`${acao}${caminho}:${expira}`).digest("base64url");
  return { base: base.replace(/\/$/, ""), q: `e=${expira}&s=${s}` };
}

/**
 * Link para o navegador mandar o arquivo (PUT), válido por 3 h. A gravação
 * das atas usa o mesmo link com /parte/<n> e /fim (pedaços de 30 s), por 14 h.
 */
export function linkDeEnvio(id: string, horas = 3): string {
  const caminho = `transcricoes/${id}`;
  const { base, q } = assinar("up:", caminho, horas * 3600);
  return `${base}/up/${caminho}?${q}`;
}

const caminhoDoAudio = (id: string) => `transcricoes/${id}.ogg`;

async function baixarAudio(id: string): Promise<Blob> {
  const { base, q } = assinar("", caminhoDoAudio(id), 600);
  const r = await fetch(`${base}/m/${caminhoDoAudio(id)}?${q}`, { cache: "no-store" });
  if (r.status === 404) throw new Error("O áudio não chegou ao servidor. Envie o arquivo de novo.");
  if (!r.ok) throw new Error(`O servidor de mídia respondeu ${r.status}.`);
  return new Blob([await r.arrayBuffer()], { type: "audio/ogg" });
}

/**
 * Copia um áudio/vídeo do WhatsApp (disco do VPS ou Storage) para a
 * transcrição `id`, pelo mesmo envio do navegador (o VPS converte e mede).
 * Vai em fluxo, sem carregar o arquivo inteiro na memória. Devolve a duração.
 */
export async function importarDoWhatsapp(id: string, midia: { path: string; mime: string | null }): Promise<number> {
  let link: string | null;
  if (midia.path.startsWith("vps:")) link = linkVps(midia.path, { segundos: 600 });
  else {
    const storage = createAdminClient().storage;
    let r = await storage.from(BUCKET_WHATSAPP).createSignedUrl(midia.path, 600);
    if (!r.data) r = await storage.from("documents").createSignedUrl(midia.path, 600);
    link = r.data?.signedUrl ?? null;
  }
  if (!link) throw new Error("O servidor de mídia (WA_MIDIA_URL) não está configurado.");
  const origem = await fetch(link, { cache: "no-store" });
  if (!origem.ok || !origem.body) throw new Error("Esse áudio não está mais disponível no servidor.");
  const r = await fetch(linkDeEnvio(id), {
    method: "PUT",
    headers: { "Content-Type": midia.mime?.split(";")[0] || "application/octet-stream" },
    body: origem.body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const j = (await r.json().catch(() => null)) as { ok?: boolean; duracao?: number; erro?: string } | null;
  if (!r.ok || !j?.ok) throw new Error(j?.erro ?? `O servidor de mídia respondeu ${r.status}.`);
  return Math.round(j.duracao ?? 0);
}

/** Apaga o áudio do VPS (depois de transcrever ou ao excluir). */
export async function apagarAudio(id: string): Promise<void> {
  try {
    const { base, q } = assinar("del:", caminhoDoAudio(id), 600);
    await fetch(`${base}/m/${caminhoDoAudio(id)}?${q}`, { method: "DELETE" });
  } catch {
    // sem problema: o arquivo some quando a pessoa excluir ou na limpeza
  }
}

/* ───────── Gemini ───────── */

const hms = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), Math.floor(s % 60)].map((n) => String(n).padStart(2, "0")).join(":");

function sistemaFiel(op: OpcoesTranscricao, contexto?: string) {
  return [
    "Você é um transcritor profissional. Transcreva o áudio em português do Brasil PALAVRA POR PALAVRA, exatamente como foi falado:",
    "- não resuma, não corrija a fala, não reescreva e não tire repetições nem hesitações (\"é…\", \"né\", \"tipo\");",
    '- escreva as palavras como foram ditas, sem abreviar ("doutor", não "Dr."); números, valores e datas podem ir em algarismos;',
    "- use pontuação e acentuação corretas e quebre em parágrafos quando muda o assunto ou quem fala;",
    "- trecho que não dá para entender: [inaudível]; sons que importam entre colchetes: [risos], [silêncio], [música];",
    "- fala em outro idioma: transcreva como foi falada;",
    op.falantes
      ? '- separe as falas por pessoa: cada fala começa numa linha nova com "Pessoa 1:", "Pessoa 2:"… (use o nome da pessoa quando ele for dito claramente no áudio e mantenha o mesmo rótulo do início ao fim);'
      : "",
    op.tempo ? "- comece cada parágrafo (ou fala) com o tempo em que ele começa no áudio inteiro, no formato [HH:MM:SS];" : "",
    "- responda SÓ com a transcrição: sem título, sem comentário, sem markdown.",
    contexto ? `\nContexto da gravação (use para acertar nomes e termos; não escreva nada que não foi dito): ${contexto}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const SISTEMA_RESUMO = `Você resume gravações (reuniões, atendimentos, áudios de clientes, audiências, ligações) para um escritório de advocacia. Escreva em português do Brasil, em texto simples SEM markdown (nada de #, * ou **), neste formato, com os títulos em MAIÚSCULAS:

RESUMO
um a três parágrafos: do que se trata, quem participa (se der para saber) e a conclusão.

PONTOS PRINCIPAIS
• um ponto por linha

DECISÕES
• o que ficou decidido

PRÓXIMOS PASSOS
• tarefa — responsável — prazo (só o que foi dito)

DATAS, VALORES E NOMES CITADOS
• um por linha

Regras: só o que foi dito, sem inventar e sem opinar; mantenha números, valores, datas, nomes, documentos e prazos exatamente como foram ditos; omita as seções que ficarem vazias (menos RESUMO).`;

function erroDoGemini(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return "Limite de uso da IA atingido. Tente de novo em alguns minutos.";
    if (e.status === 400 && /api key/i.test(e.message)) return "A chave do Gemini é inválida.";
    if (e.status === 401 || e.status === 403) return "A chave do Gemini não tem permissão.";
    if (e.status >= 500) return "A IA está instável agora. Tente de novo em instantes.";
    return `Erro da IA (${e.status}).`;
  }
  return e instanceof Error ? e.message : "Falha na IA.";
}

function cliente() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("A chave do Gemini (GEMINI_API_KEY) não está configurada no servidor.");
  return new GoogleGenAI({ apiKey });
}

async function gerarTexto(ai: GoogleGenAI, sistema: string, partes: ({ text: string } | { fileData: { fileUri: string; mimeType: string } })[]): Promise<string> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const r = await ai.models.generateContent({
        model: MODELOS.transcricao,
        contents: [{ role: "user", parts: partes }],
        config: { systemInstruction: sistema, maxOutputTokens: 32_768, temperature: 0.2, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      });
      const fim = r.candidates?.[0]?.finishReason;
      if (r.promptFeedback?.blockReason || fim === "SAFETY" || fim === "PROHIBITED_CONTENT") throw new Error("A IA recusou este conteúdo.");
      return (r.text ?? "").trim();
    } catch (e) {
      // instabilidade/limite: tenta mais 2 vezes
      if (tentativa < 3 && e instanceof ApiError && (e.status === 429 || e.status >= 500)) {
        await new Promise((ok) => setTimeout(ok, 2500 * tentativa));
        continue;
      }
      throw new Error(erroDoGemini(e));
    }
  }
}

async function subirNoGemini(ai: GoogleGenAI, audio: Blob, nome: string): Promise<ArquivoGemini> {
  let f = await ai.files.upload({ file: audio, config: { mimeType: "audio/ogg", displayName: nome.slice(0, 100) } });
  const limite = Date.now() + 120_000;
  while (f.state === "PROCESSING" && Date.now() < limite) {
    await new Promise((ok) => setTimeout(ok, 2000));
    f = await ai.files.get({ name: f.name! });
  }
  if (f.state !== "ACTIVE") throw new Error("A IA não conseguiu abrir o áudio.");
  return f;
}

/** Roda as tarefas com no máximo `n` ao mesmo tempo, mantendo a ordem. */
async function emParalelo<T>(tarefas: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(tarefas.length);
  let proxima = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tarefas.length) }, async () => {
      while (proxima < tarefas.length) {
        const i = proxima++;
        out[i] = await tarefas[i]();
      }
    })
  );
  return out;
}

export type ResultadoTranscricao = { texto: string | null; resumo: string | null; trechos: number };

/** Transcreve o áudio que está no VPS: fiel (em trechos paralelos) e/ou resumo. */
export async function transcrever(
  id: string,
  { modo, opcoes, duracao, nome, contexto }: { modo: ModoTranscricao; opcoes: OpcoesTranscricao; duracao: number; nome: string; contexto?: string }
): Promise<ResultadoTranscricao> {
  const ai = cliente();
  const audio = await baixarAudio(id);
  const arquivo = await subirNoGemini(ai, audio, nome);
  const ref = { fileData: { fileUri: arquivo.uri!, mimeType: arquivo.mimeType ?? "audio/ogg" } };
  try {
    let texto: string | null = null;
    let trechos = 0;
    if (modo !== "resumo") {
      const sistema = sistemaFiel(opcoes, contexto);
      const partes: { ini: number; fim: number }[] = [];
      if (!duracao || duracao <= UM_TRECHO_ATE) partes.push({ ini: 0, fim: duracao || 0 });
      else for (let ini = 0; ini < duracao; ini += TRECHO_SEG) partes.push({ ini, fim: Math.min(duracao, ini + TRECHO_SEG) });
      trechos = partes.length;
      const textos = await emParalelo(
        partes.map((p) => () =>
          gerarTexto(ai, sistema, [
            ref,
            {
              text:
                partes.length === 1
                  ? "Transcreva o áudio inteiro."
                  : `Transcreva SOMENTE o trecho do áudio de ${hms(p.ini)} até ${hms(p.fim)} (o áudio tem ${hms(duracao)} no total). Se a primeira frase começar antes de ${hms(p.ini)}, comece na primeira frase que começa dentro do trecho; se a última frase passar de ${hms(p.fim)}, termine essa frase.`,
            },
          ])
        ),
        PARALELO
      );
      texto = textos.filter(Boolean).join("\n\n").trim();
      if (!texto) throw new Error("Não deu para entender nada no áudio (vazio ou inaudível).");
    }
    let resumo: string | null = null;
    if (modo !== "fiel") resumo = await resumir(ai, texto ? { texto } : { ref }, opcoes.instrucao);
    return { texto, resumo, trechos };
  } finally {
    await ai.files.delete({ name: arquivo.name! }).catch(() => {});
  }
}

async function resumir(ai: GoogleGenAI, de: { texto: string } | { ref: { fileData: { fileUri: string; mimeType: string } } }, instrucao?: string): Promise<string> {
  const extra = instrucao?.trim() ? `\n\nInstrução de quem pediu o resumo (siga, sem fugir do formato): ${instrucao.trim().slice(0, 600)}` : "";
  const partes = "texto" in de ? [{ text: `Transcrição da gravação:\n\n${de.texto}${extra}` }] : [de.ref, { text: `Resuma a gravação.${extra}` }];
  const r = await gerarTexto(ai, SISTEMA_RESUMO, partes);
  if (!r) throw new Error("A IA não devolveu o resumo. Tente de novo.");
  return r.replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
}

/**
 * Roda a transcrição de ponta a ponta e grava o resultado: processando →
 * pronta (apaga o áudio do VPS) ou erro (o áudio fica para "Tentar de novo").
 */
export async function executarTranscricao(
  id: string,
  dados: { modo: ModoTranscricao; opcoes: OpcoesTranscricao; duracao: number; nome: string; contexto?: string; manterAudio?: boolean }
): Promise<ResultadoTranscricao> {
  const adm = createAdminClient() as unknown as SupabaseClient;
  await adm.from("transcricoes").update({ status: "processando", erro: null, duracao_seg: dados.duracao || null }).eq("id", id);
  try {
    const r = await transcrever(id, dados);
    await adm.from("transcricoes").update({ status: "pronta", texto: r.texto, resumo: r.resumo, updated_at: new Date().toISOString() }).eq("id", id);
    if (!dados.manterAudio) await apagarAudio(id);
    return r;
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Falha ao transcrever.";
    console.error("transcrição:", id, erro);
    await adm.from("transcricoes").update({ status: "erro", erro }).eq("id", id);
    throw new Error(erro);
  }
}

/** Pergunta de texto para a IA (gerador de atas), com as mesmas novas tentativas. */
export async function perguntarIA(sistema: string, texto: string): Promise<string> {
  return gerarTexto(cliente(), sistema, [{ text: texto }]);
}

/** Link de leitura do áudio da transcrição (player da revisão da ata). */
export function linkDoAudio(id: string, segundos = 3 * 3600): string {
  const { base, q } = assinar("", caminhoDoAudio(id), segundos);
  return `${base}/m/${caminhoDoAudio(id)}?${q}`;
}

/** Resumo feito depois, a partir do texto já transcrito (botão "Gerar resumo"). */
export async function resumirTexto(texto: string, instrucao?: string): Promise<string> {
  return resumir(cliente(), { texto }, instrucao);
}
