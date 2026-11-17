"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Part } from "@google/genai";
import { exigirPermissao } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { buscarNoInpi, buscarNomeNoInpi, buscarProcuradorNaBase, fichaNoInpi, logoNoInpi, type ResultadoBusca } from "@/lib/marcas/inpi";
import { buscarProcuradorNaCarteira } from "@/lib/marcas/procurador";
import { consultarBase, situacaoDoDespacho } from "@/lib/marcas/base";
import { semelhanca } from "@/lib/marcas/revista";
import { chaveFonetica, parecencaFonetica } from "@/lib/marcas/fonetica";

// Busca Integrada e Busca com IA (viabilidade), as mesmas do Marca Acompanhada.
// Tudo vai ao pePI pela ponte da VPS, com pausa entre as consultas (o INPI
// bloqueia o IP quando recebe pedidos em sequência, visto em 31/10/2026).

const db = () => createAdminClient() as unknown as SupabaseClient;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
const classeNum = (c: string) => c.match(/(\d{1,2})\s*$/)?.[1]?.replace(/^0/, "") ?? "";

export type ResultadoIntegrada = ResultadoBusca & { relevancia: number; jaRegistrado: boolean };
type Resp<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Variações de grafia que soam igual (para a busca Fonética, que o pePI não tem). */
function variacoes(termo: string): string[] {
  const t = termo.toUpperCase();
  const trocas: [RegExp, string][] = [
    [/K/g, "C"],
    [/C(?=[AOU])/g, "K"],
    [/Z/g, "S"],
    [/S(?=[AEIOU])/g, "Z"],
    [/PH/g, "F"],
    [/Y/g, "I"],
    [/I/g, "Y"],
    [/W/g, "V"],
    [/(.)\1/g, "$1"],
  ];
  const out = new Set<string>();
  for (const [re, por] of trocas) {
    const v = t.replace(re, por);
    if (v !== t) out.add(v);
  }
  return [...out].slice(0, 2);
}

async function marcarJaNaCarteira<T extends { processo: string }>(lista: T[]): Promise<(T & { jaRegistrado: boolean })[]> {
  const { data } = await db().from("marcas").select("processo").eq("acompanhando", true).in("processo", lista.map((r) => r.processo).slice(0, 500));
  const ja = new Set((data ?? []).map((x) => x.processo as string));
  return lista.map((r) => ({ ...r, jaRegistrado: ja.has(r.processo) }));
}

/** Busca Integrada: nome (exata, radical ou fonética), titular, procurador ou nº do processo. */
export async function buscaIntegradaAction(p: { modo: "nome" | "titular" | "procurador" | "processo"; termo: string; tipo?: "exata" | "radical" | "fonetica"; classe?: string }): Promise<Resp<{ resultados: ResultadoIntegrada[]; total: number }>> {
  await exigirPermissao("marcas");
  const termo = p.termo.trim();
  if (termo.length < 2) return { ok: false, error: "Digite um termo de busca." };
  try {
    let lista: ResultadoBusca[] = [];
    let total = 0;
    if (p.modo === "nome") {
      if (p.tipo === "fonetica") {
        // radical do termo e de até 2 grafias que soam igual, ficando só o que soa parecido
        const termos = [termo, ...variacoes(termo)];
        const vistos = new Map<string, ResultadoBusca>();
        for (const [i, t] of termos.entries()) {
          if (i > 0) await pausa(4_000);
          for (const r of (await buscarNomeNoInpi(t, true, p.classe)).resultados) vistos.set(r.processo, r);
        }
        lista = [...vistos.values()].filter((r) => parecencaFonetica(termo, r.marca) >= 0.7 || chaveFonetica(r.marca).includes(chaveFonetica(termo)));
        total = lista.length;
      } else {
        ({ resultados: lista, total } = await buscarNomeNoInpi(termo, p.tipo === "radical", p.classe));
      }
    } else if (p.modo === "procurador") {
      // o pePI não busca marca por procurador: carteira do portal (sem acento) + base própria
      // (todas as revistas desde 2017), como no Cadastrar (10/11/2026)
      const daCarteira = await buscarProcuradorNaCarteira(termo);
      const base = await buscarProcuradorNaBase(termo, p.classe).catch(() => null);
      const vistos = new Set(daCarteira.map((m) => m.processo));
      lista = [...daCarteira, ...(base?.resultados ?? []).filter((r) => !vistos.has(r.processo))];
      total = Math.max(lista.length, (base?.total ?? 0) + daCarteira.length);
    } else {
      ({ resultados: lista, total } = await buscarNoInpi(p.modo, termo));
    }
    const comNota = lista.map((r) => ({ ...r, relevancia: p.modo === "nome" ? Math.round(Math.max(semelhanca(termo, r.marca), parecencaFonetica(termo, r.marca)) * 100) : 0 }));
    if (p.modo === "nome") comNota.sort((a, b) => b.relevancia - a.relevancia);
    return { ok: true, total, resultados: await marcarJaNaCarteira(comNota) };
  } catch (e) {
    return { ok: false, error: `Não foi possível consultar o INPI agora (${(e as Error).message}). Tente de novo em instantes.` };
  }
}

// ───────────── Busca com IA (viabilidade) ─────────────

export type Parecer = {
  risco: "baixo" | "medio" | "alto";
  resumo: string;
  classes: { classe: string; motivo: string; risco: "baixo" | "medio" | "alto"; comentario: string }[];
  anterioridades: { processo: string; marca: string; classe: string; situacao: string; titular: string; relevancia: number; motivo: string }[];
  recomendacoes: string[];
};
/** Uma pesquisa feita no INPI durante a Busca com IA (aparece no relatório como no pePI). */
export type Pesquisa = { termo: string; tipo: string; total: number; em: string; fonte: string; processos: string[] };

// 17/11/2026: relatório no modelo do "Relatório de Viabilidade de Marca" do Marca Acompanhada
// (modelo em Downloads/MC Advogados/Marca Acompanhada - Relatorio de Viabilidade ….pdf).
// Textos podem ter **negrito**.
type Nivel = "alta" | "media" | "baixa";
export type DetalheMarca = {
  processo: string;
  marca: string;
  titular: string | null;
  classe: string | null;
  deposito: string | null;
  tipo: string | null;
  natureza: string | null;
  situacao: string | null;
  procurador: string | null;
  especificacao: string | null;
  logo: string | null;
  fonte: "base" | "inpi" | "lista";
};
export type AnaliseVisual = { descricao: string[]; comparacoes: { processo: string; titulo: string; pontos: string[] }[]; fechamento: string; semLogos?: boolean };
export type RelatorioMA = {
  formato: "ma";
  risco: "baixo" | "medio" | "alto";
  resumo: { abertura: string; topicos: { titulo: string; texto: string }[]; fechamento: string };
  principais: { processo: string; marca: string; classe: string; afinidade: Nivel; motivo: string }[];
  principaisNota: string;
  porClasse: { nivel: "forte" | "moderado" | "fraco"; titulo: string; introducao: string; itens: { titulo: string; processos: string[]; pontos: string[] }[]; fechamento: string }[];
  conclusao: { pontos: { titulo: string; texto: string }[]; texto: string };
  recomendacoes: { titulo: string; pontos: string[] }[];
  estimativa: { indeferimento: string; oposicao: string[]; sintese: string };
  detalhes?: Record<string, DetalheMarca>;
  visual?: AnaliseVisual | null;
};

const SISTEMA_RELATORIO = `Você é advogado especialista em marcas (Lei 9.279/96, art. 124, incisos V, VI e XIX; prática decisória do INPI) e escreve um RELATÓRIO DE VIABILIDADE DE MARCA, em português do Brasil, no mesmo estilo do "Relatório de Viabilidade de Marca" do Marca Acompanhada: técnico, direto, frases curtas, com **negrito** nos termos e conclusões que importam.
Recebe a marca pesquisada, uso/classe, contexto e as anterioridades encontradas no INPI (relevância 0–100 por semelhança gráfica/fonética). Avalie semelhança gráfica, fonética e ideológica (conceitual) E afinidade mercadológica. Marcas arquivadas, extintas ou indeferidas pesam pouco. Nunca invente processos: use só os da lista; sempre escreva o número entre parênteses depois do nome, ex.: CURVACEOUS (904596583).
Monte:
- risco: geral (baixo, medio ou alto).
- resumo.abertura: "A marca consultada **<MARCA>** para <produtos/serviços> na classe <NN> apresenta:".
- resumo.topicos: 2 a 4 tópicos; titulo curto em negrito (ex.: "Baixa similaridade nominativa", "Elemento distintivo relevante", "Similaridade visual moderada" — este só se houver logo) e texto de 1–2 frases.
- resumo.fechamento: 2–3 frases sobre a prática do INPI e o risco geral, citando as anterioridades que mais pedem atenção.
- principais: as principais anterioridades (até 10), mais relevantes primeiro: marca, classe ("Classe 3"), afinidade (alta/media/baixa) e motivo (1–3 frases: mesma classe? produtos? semelhança/diferença fonética, gráfica, conceitual).
- principaisNota: 1–2 frases sobre as demais anterioridades (outras classes, extintas) e seu peso.
- porClasse: grupos "forte", "moderado" e "fraco" (só os que existirem). titulo ex.: "Classe 03 (cosméticos capilares)" ou "Outras classes correlatas (35, 41, 44)"; introducao 1–2 frases; itens: cada item é uma marca ou um conjunto parecido (titulo "NOME (processo) / NOME (processo)", processos = números), com pontos no formato "Similaridade: …", "Diferenças: …", "Tendência: …" ou "Conflito: …"; fechamento 1 frase (pode ser vazio).
- conclusao.pontos: "Nominativo", "Conceitual" e "Visual" (este só se houver logo; diga que a análise visual detalhada está na seção própria) com 1–3 frases cada; conclusao.texto: parágrafo final com a probabilidade de conflito impeditivo e as anterioridades que mais pedem atenção.
- recomendacoes: 3 a 6 blocos com titulo (ex.: "Depósito como marca mista", "Ajustes de especificação em classe NN", "Monitoramento de oposições", "Uso consistente da marca", "Coleta de evidências de uso") e 1–3 pontos cada.
- estimativa.indeferimento: ex.: "Nominativo: Baixo a moderado · Visual (marca mista): Moderado"; estimativa.oposicao: 1–3 frases "Por titulares de …: moderada."; estimativa.sintese: "Em síntese, **<MARCA>** é registrável com perspectiva …".`;

const SISTEMA_VISUAL = `Você é especialista em marcas no INPI e escreve a seção "Análise Visual" de um relatório de viabilidade, em português do Brasil, no estilo do Marca Acompanhada.
A 1ª imagem é o logo da marca pesquisada; depois vêm os logos das anterioridades, cada um com nome e processo.
Devolva:
- descricao: 2 a 4 tópicos descrevendo o logo pesquisado (forma, letra, figura, cores, tipografia).
- comparacoes: para cada anterioridade com alguma semelhança visual relevante (no máximo 8), titulo "NOME (processo)" e pontos: descrição do logo dela, "Similaridade: …", "Diferença(s): …", "Risco visual: baixo/moderado/alto, …".
- fechamento: 1–2 frases sobre o quanto os elementos gráficos são comuns no segmento e o peso disso no INPI.
Use só os processos informados. Use **negrito** no nível de risco.`;

const nivel = { type: "string", enum: ["alta", "media", "baixa"] };
const texto = { type: "string" };
const lista = { type: "array", items: texto };
const SCHEMA_RELATORIO = {
  type: "object",
  properties: {
    risco: { type: "string", enum: ["baixo", "medio", "alto"] },
    resumo: { type: "object", properties: { abertura: texto, topicos: { type: "array", items: { type: "object", properties: { titulo: texto, texto }, required: ["titulo", "texto"] } }, fechamento: texto }, required: ["abertura", "topicos", "fechamento"] },
    principais: { type: "array", items: { type: "object", properties: { processo: texto, marca: texto, classe: texto, afinidade: nivel, motivo: texto }, required: ["processo", "marca", "classe", "afinidade", "motivo"] } },
    principaisNota: texto,
    porClasse: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nivel: { type: "string", enum: ["forte", "moderado", "fraco"] },
          titulo: texto,
          introducao: texto,
          itens: { type: "array", items: { type: "object", properties: { titulo: texto, processos: lista, pontos: lista }, required: ["titulo", "processos", "pontos"] } },
          fechamento: texto,
        },
        required: ["nivel", "titulo", "introducao", "itens", "fechamento"],
      },
    },
    conclusao: { type: "object", properties: { pontos: { type: "array", items: { type: "object", properties: { titulo: texto, texto }, required: ["titulo", "texto"] } }, texto }, required: ["pontos", "texto"] },
    recomendacoes: { type: "array", items: { type: "object", properties: { titulo: texto, pontos: lista }, required: ["titulo", "pontos"] } },
    estimativa: { type: "object", properties: { indeferimento: texto, oposicao: lista, sintese: texto }, required: ["indeferimento", "oposicao", "sintese"] },
  },
  required: ["risco", "resumo", "principais", "principaisNota", "porClasse", "conclusao", "recomendacoes", "estimativa"],
};

export type EntradaBusca = { nome: string; siglas: boolean; ondeUsar: string; contexto: string; textoLogo?: string; usarTextoLogo?: boolean; extras?: { processo: string; marca: string; classes: string; situacao: string; titular: string }[] };

const SISTEMA_PLANO = `Você é especialista em registro de marcas no INPI (Brasil, Classificação de Nice NCL 12ª ed.).
Recebe a marca que o cliente quer depositar e onde ela será usada. Devolva:
- classes: as classes NCL relevantes (no máximo 4, a principal primeiro) com o motivo em uma frase;
- termos: até 3 termos para buscar anterioridades no INPI (o elemento nominativo inteiro; o termo mais distintivo isolado; se houver, a parte sem palavras genéricas de ramo). Em maiúsculas, sem acento é aceito.
- texto_logo: se veio imagem, o texto que aparece no logo (senão vazio).
Se a marca tem siglas, mantenha a sigla como termo.`;

/** Busca com IA: classes e termos pela IA → anterioridades no pePI → parecer da IA, guardado no histórico. */
export async function buscaIAAction(e: EntradaBusca & { logo?: { mime: string; base64: string } | null }): Promise<Resp<{ id: string }>> {
  const { profile } = await exigirPermissao("marcas");
  const nome = e.nome.trim();
  if (!nome && !e.logo) return { ok: false, error: "Informe o elemento nominativo ou envie o logo." };
  if (!e.ondeUsar.trim()) return { ok: false, error: "Diga onde a marca será usada (ramo ou classes)." };
  if (e.logo && e.logo.base64.length > 7_000_000) return { ok: false, error: "Logo grande demais (máx. 5 MB)." };

  // 1) classes e termos
  const partes: Part[] = [{ text: `Marca: ${nome || "(só logo)"}${e.siglas ? " (contém siglas/abreviações)" : ""}\nOnde será usada: ${e.ondeUsar}\nContexto: ${e.contexto || "-"}` }];
  if (e.logo) partes.push({ inlineData: { mimeType: e.logo.mime, data: e.logo.base64 } });
  const plano = await generateJson<{ classes: { classe: string; motivo: string }[]; termos: string[]; texto_logo: string }>({
    system: SISTEMA_PLANO,
    parts: partes,
    model: MODELOS.leitura, funcao: "marcas_busca",
    schema: {
      type: "object",
      properties: {
        classes: { type: "array", items: { type: "object", properties: { classe: { type: "string" }, motivo: { type: "string" } }, required: ["classe", "motivo"] } },
        termos: { type: "array", items: { type: "string" } },
        texto_logo: { type: "string" },
      },
      required: ["classes", "termos", "texto_logo"],
    },
  });
  if (!plano.ok) return { ok: false, error: plano.error };
  const classes = plano.data.classes.slice(0, 4).map((c) => ({ ...c, classe: classeNum(c.classe) || c.classe }));
  const textoLogo = (e.textoLogo?.trim() || plano.data.texto_logo || "").trim();
  const termos = [...new Set([nome, ...plano.data.termos, ...(e.usarTextoLogo && textoLogo ? [textoLogo] : [])].map((t) => t.trim().toUpperCase()).filter((t) => t.length >= 2))].slice(0, 3);

  // 2) anterioridades no INPI (radical de cada termo, devagar). Cada pesquisa fica registrada
  //    como no pePI ("RESULTADO DA PESQUISA (data às hora) Marca: X — Foram encontrados N processos").
  const achados = new Map<string, ResultadoBusca & { termos: string[] }>();
  const pesquisas: Pesquisa[] = [];
  // 10/11/2026: a página tem 120 s; a base própria lenta (antes do índice) estourava o tempo (504).
  // Ela agora só completa enquanto sobra tempo e cada consulta tem no máximo 10 s.
  const inicio = Date.now();
  const sobraTempo = () => Date.now() - inicio < 60_000;
  try {
    for (const [i, t] of termos.entries()) {
      if (i > 0) await pausa(4_000);
      // 2 páginas por termo (200 processos): termo genérico ("TOP") traz milhares e estourava o tempo
      const r = await buscarNomeNoInpi(t, true, null, 2);
      pesquisas.push({ termo: t, tipo: "Radical", total: r.total, em: new Date().toISOString(), fonte: r.fonte === "base" ? `base própria (revistas até a RPI ${r.revista ?? "?"})` : "INPI (pePI) ao vivo", processos: r.resultados.map((x) => x.processo) });
      for (const x of r.resultados) achados.set(x.processo, { ...x, termos: [...(achados.get(x.processo)?.termos ?? []), t] });
      // termo genérico: o pePI só deu as 2 primeiras páginas. Completa com a base própria (todas as revistas
      // desde 2017), por classe pesquisada, para não perder pedidos recentes nessas classes (09/11/2026)
      if (r.fonte === "inpi" && r.total > r.resultados.length) {
        for (const c of classes) {
          if (!sobraTempo()) break;
          const b = await consultarBase("radical", t, c.classe, 300, 10_000).catch(() => null);
          for (const l of b?.resultados ?? []) {
            if (achados.has(l.numero)) continue;
            achados.set(l.numero, {
              processo: l.numero,
              codPedido: "",
              marca: l.marca ?? "",
              situacao: situacaoDoDespacho(l.ultimo_despacho, l.concessao),
              titular: l.titular ?? "",
              classes: l.classes ? l.classes.split(",").map((x) => `NCL ${x}`).join(", ") : "",
              deposito: l.deposito,
              apresentacao: l.apresentacao,
              termos: [t],
            });
            pesquisas.at(-1)!.processos.push(l.numero);
          }
        }
        pesquisas.at(-1)!.fonte += " + base própria nas classes pesquisadas";
      }
    }
  } catch (err) {
    return { ok: false, error: `Não foi possível consultar o INPI agora (${(err as Error).message}). Tente de novo em instantes.` };
  }
  const nums = new Set(classes.map((c) => c.classe));
  const ref = nome || textoLogo || termos[0] || "";
  const candidatos = [...achados.values()]
    .map((r) => ({ ...r, relevancia: Math.round(Math.max(...termos.map((t) => Math.max(semelhanca(t, r.marca), parecencaFonetica(t, r.marca)))) * 100) }))
    .filter((r) => r.relevancia >= 45 && (!nums.size || [...nums].some((n) => r.classes.includes(n))))
    .sort((a, b) => b.relevancia - a.relevancia)
    .slice(0, 40);
  const extras = (e.extras ?? []).slice(0, 20).map((x) => ({ ...x, relevancia: 100, deposito: null, codPedido: "" }));

  // 3) relatório no modelo do Marca Acompanhada ("Relatório de Viabilidade de Marca", 17/11/2026)
  const lista = [...extras, ...candidatos]
    .map((r) => `${r.processo} | ${r.marca} | classe ${r.classes} | ${r.situacao} | ${r.titular} | ${"apresentacao" in r && r.apresentacao ? r.apresentacao : "-"} | relevância ${r.relevancia}`)
    .join("\n");
  const rel = await generateJson<Omit<RelatorioMA, "formato">>({
    system: SISTEMA_RELATORIO,
    parts: [
      {
        text: `Marca pesquisada: ${ref}${e.siglas ? " (contém siglas)" : ""}\nUso/Classe pretendida: ${e.ondeUsar}\nContexto adicional: ${e.contexto || "-"}\nClasses: ${classes.map((c) => `${c.classe} (${c.motivo})`).join("; ")}\nTem logo: ${e.logo ? "sim (a análise visual é feita depois, com os logos das anterioridades)" : "não"}\n\nAnterioridades encontradas no INPI (${candidatos.length + extras.length}) — processo | marca | classe | situação | titular | apresentação | relevância:\n${lista || "nenhuma"}`,
      },
    ],
    model: MODELOS.leitura,
    funcao: "marcas_busca",
    schema: SCHEMA_RELATORIO,
  });
  if (!rel.ok) return { ok: false, error: rel.error };
  // só processos que vieram do INPI (a IA não inventa número)
  const validos = new Set([...candidatos, ...extras].map((r) => r.processo));
  const d = rel.data;
  const relatorio: RelatorioMA = {
    ...d,
    formato: "ma",
    principais: d.principais.filter((a) => validos.has(a.processo)),
    porClasse: d.porClasse.map((g) => ({ ...g, itens: g.itens.map((i) => ({ ...i, processos: i.processos.filter((p) => validos.has(p)) })) })),
  };
  const id = crypto.randomUUID();
  // logo enviado: guardado para o relatório ("Elemento visual pesquisado") e para a análise visual
  let logoUrl: string | null = null;
  if (e.logo) {
    const ext = e.logo.mime.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "png";
    const caminho = `buscas/${id}.${ext}`;
    const up = await db().storage.from("marcas").upload(caminho, Buffer.from(e.logo.base64, "base64"), { contentType: e.logo.mime, cacheControl: "604800", upsert: true });
    if (!up.error) logoUrl = db().storage.from("marcas").getPublicUrl(caminho).data.publicUrl;
  }
  const resultado = { ...relatorio, termos, encontrados: candidatos, pesquisas, classesPesquisadas: classes.map((c) => c.classe), detalhes: {}, visual: null };

  const { error } = await db()
    .from("marca_buscas")
    .insert({ id, nome: ref, entrada: { nome, siglas: e.siglas, ondeUsar: e.ondeUsar, contexto: e.contexto, textoLogo, logoUrl, classes: classes.map((c) => c.classe) }, resultado, criado_por: profile.id });
  if (error) return { ok: false, error: "A busca foi feita, mas não consegui guardar no histórico (a tabela marca_buscas existe? rode a migration 0062)." };
  return { ok: true, id };
}

// ───────────── Relatório: detalhes das marcas e análise visual (2ª etapa, na página) ─────────────

/** Processos citados no relatório (principais + análise por classe), na ordem em que aparecem. */
function citados(r: RelatorioMA): string[] {
  const out: string[] = [];
  for (const p of [...r.principais.map((a) => a.processo), ...r.porClasse.flatMap((g) => g.itens.flatMap((i) => i.processos))]) if (!out.includes(p)) out.push(p);
  return out.slice(0, 25);
}

async function lerBusca(id: string) {
  const { data } = await db().from("marca_buscas").select("id, entrada, resultado").eq("id", id).maybeSingle();
  return data as { id: string; entrada: Record<string, unknown>; resultado: RelatorioMA & { encontrados?: (ResultadoBusca & { relevancia: number })[] } } | null;
}

/** Guarda uma chave do resultado sem sobrescrever o resto (relê antes de gravar). */
async function gravarNoResultado(id: string, muda: (r: Record<string, unknown>) => void) {
  const b = await lerBusca(id);
  if (!b) return;
  const r = b.resultado as unknown as Record<string, unknown>;
  muda(r);
  await db().from("marca_buscas").update({ resultado: r }).eq("id", id);
}

/** O que ainda falta completar no relatório (a página chama um por um). */
export async function pendentesRelatorioAction(id: string): Promise<{ processos: string[]; visual: boolean }> {
  await exigirPermissao("marcas");
  const b = await lerBusca(id);
  if (!b || b.resultado.formato !== "ma") return { processos: [], visual: false };
  const feitos = b.resultado.detalhes ?? {};
  const processos = citados(b.resultado).filter((p) => !feitos[p]);
  return { processos, visual: !!b.entrada.logoUrl && !b.resultado.visual };
}

/** Ficha (base própria das revistas; pePI se ela não tiver) + logo do INPI de uma marca citada. */
export async function completarMarcaBuscaAction(id: string, processo: string): Promise<Resp<{ detalhe: DetalheMarca }>> {
  await exigirPermissao("marcas");
  if (!/^\d{9}$/.test(processo)) return { ok: false, error: "Processo inválido." };
  const b = await lerBusca(id);
  if (!b) return { ok: false, error: "Relatório não encontrado." };
  const doRelatorio = b.resultado.encontrados?.find((x) => x.processo === processo);

  let det: DetalheMarca = { processo, marca: doRelatorio?.marca ?? "", titular: doRelatorio?.titular ?? null, classe: doRelatorio?.classes ?? null, deposito: doRelatorio?.deposito ?? null, tipo: doRelatorio?.apresentacao ?? null, natureza: null, situacao: doRelatorio?.situacao ?? null, procurador: null, especificacao: null, logo: null, fonte: "lista" };
  const base = await consultarBase("processo", processo, null, 1, 10_000).catch(() => null);
  const l = base?.resultados.find((x) => x.numero === processo);
  if (l) {
    det = {
      ...det,
      marca: l.marca ?? det.marca,
      titular: l.titular ?? det.titular,
      classe: l.classes ? l.classes.split(",").map((c) => `NCL ${c.trim()}`).join("; ") : det.classe,
      deposito: l.deposito ?? det.deposito,
      tipo: l.apresentacao ?? det.tipo,
      natureza: l.natureza,
      situacao: situacaoDoDespacho(l.ultimo_despacho, l.concessao),
      procurador: l.procurador,
      especificacao: l.especificacao,
      fonte: "base",
    };
  } else {
    const f = await fichaNoInpi(processo).catch(() => null);
    if (f) det = { ...det, marca: f.marca ?? det.marca, titular: f.titular, classe: f.classe, deposito: f.deposito, tipo: f.apresentacao, natureza: f.natureza, situacao: f.situacao, procurador: f.procurador, especificacao: f.especificacao, fonte: "inpi" };
  }

  // logo (marca nominativa não tem): guardado em marcas/logos-inpi/<processo> para as próximas buscas
  if (!/nominativ/i.test(det.tipo ?? "")) {
    const pasta = db().storage.from("marcas");
    const { data: ja } = await pasta.list("logos-inpi", { search: processo, limit: 1 });
    if (ja?.length) det.logo = pasta.getPublicUrl(`logos-inpi/${ja[0].name}`).data.publicUrl;
    else {
      let cod = doRelatorio?.codPedido ?? "";
      if (!cod) cod = (await buscarNoInpi("processo", processo, { semReserva: true }).catch(() => null))?.resultados.find((x) => x.processo === processo)?.codPedido ?? "";
      const dataUrl = cod ? await logoNoInpi(processo, cod).catch(() => null) : null;
      const m = dataUrl?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
      if (m) {
        const nomeArq = `logos-inpi/${processo}.${m[1].split("/")[1].replace("jpeg", "jpg").replace("+xml", "")}`;
        const up = await pasta.upload(nomeArq, Buffer.from(m[2], "base64"), { contentType: m[1], cacheControl: "604800", upsert: true });
        if (!up.error) det.logo = pasta.getPublicUrl(nomeArq).data.publicUrl;
      }
    }
  }
  await gravarNoResultado(id, (r) => {
    r.detalhes = { ...((r.detalhes as Record<string, DetalheMarca>) ?? {}), [processo]: det };
  });
  return { ok: true, detalhe: det };
}

/** Análise Visual: o logo enviado comparado com os logos das anterioridades (como no Marca Acompanhada). */
export async function analiseVisualBuscaAction(id: string): Promise<Resp<{ feito: boolean }>> {
  await exigirPermissao("marcas");
  const b = await lerBusca(id);
  if (!b) return { ok: false, error: "Relatório não encontrado." };
  const logoUrl = b.entrada.logoUrl as string | undefined;
  if (!logoUrl) return { ok: true, feito: false };
  const baixar = async (url: string) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r?.ok) return null;
    const tipo = r.headers.get("content-type")?.split(";")[0] ?? "image/png";
    return { mimeType: tipo, data: Buffer.from(await r.arrayBuffer()).toString("base64") };
  };
  const nosso = await baixar(logoUrl);
  if (!nosso) return { ok: false, error: "Não consegui abrir o logo enviado." };
  const comLogo = citados(b.resultado)
    .map((p) => b.resultado.detalhes?.[p])
    .filter((x): x is DetalheMarca => !!x?.logo)
    .slice(0, 10);
  const partes: Part[] = [{ text: `Marca pesquisada: ${b.entrada.nome || "(só logo)"}. Uso: ${b.entrada.ondeUsar}. 1ª imagem = logo da marca pesquisada.` }, { inlineData: nosso }];
  for (const d of comLogo) {
    const img = await baixar(d.logo!);
    if (!img) continue;
    partes.push({ text: `Logo da anterioridade ${d.marca} (${d.processo}), classe ${d.classe ?? "-"}, ${d.situacao ?? ""}:` }, { inlineData: img });
  }
  const r = await generateJson<AnaliseVisual>({
    system: SISTEMA_VISUAL,
    parts: partes,
    model: MODELOS.leitura,
    funcao: "marcas_busca",
    schema: {
      type: "object",
      properties: {
        descricao: { type: "array", items: { type: "string" } },
        comparacoes: { type: "array", items: { type: "object", properties: { processo: { type: "string" }, titulo: { type: "string" }, pontos: { type: "array", items: { type: "string" } } }, required: ["processo", "titulo", "pontos"] } },
        fechamento: { type: "string" },
      },
      required: ["descricao", "comparacoes", "fechamento"],
    },
  });
  if (!r.ok) return { ok: false, error: r.error };
  const validos = new Set(comLogo.map((d) => d.processo));
  const visual: AnaliseVisual = { ...r.data, comparacoes: r.data.comparacoes.filter((c) => validos.has(c.processo)), semLogos: comLogo.length === 0 };
  await gravarNoResultado(id, (res) => {
    res.visual = visual;
  });
  return { ok: true, feito: true };
}
