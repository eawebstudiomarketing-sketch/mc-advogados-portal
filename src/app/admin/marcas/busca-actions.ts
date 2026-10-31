"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Part } from "@google/genai";
import { exigirPermissao } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { buscarNoInpi, buscarNomeNoInpi, type ResultadoBusca } from "@/lib/marcas/inpi";
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
      // o pePI não busca marca por procurador: procura nas marcas que o portal conhece
      const { data } = await db().from("marcas").select("processo, nome, situacao, titular, classe, deposito").ilike("procurador", `%${termo.replace(/[%_]/g, " ")}%`).limit(500);
      lista = (data ?? []).map((m) => ({ processo: m.processo, codPedido: "", marca: m.nome ?? "", situacao: m.situacao ?? "", titular: m.titular ?? "", classes: m.classe ?? "", deposito: m.deposito }));
      total = lista.length;
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
export type EntradaBusca = { nome: string; siglas: boolean; ondeUsar: string; contexto: string; textoLogo?: string; usarTextoLogo?: boolean; extras?: { processo: string; marca: string; classes: string; situacao: string; titular: string }[] };

const SISTEMA_PLANO = `Você é especialista em registro de marcas no INPI (Brasil, Classificação de Nice NCL 12ª ed.).
Recebe a marca que o cliente quer depositar e onde ela será usada. Devolva:
- classes: as classes NCL relevantes (no máximo 4, a principal primeiro) com o motivo em uma frase;
- termos: até 3 termos para buscar anterioridades no INPI (o elemento nominativo inteiro; o termo mais distintivo isolado; se houver, a parte sem palavras genéricas de ramo). Em maiúsculas, sem acento é aceito.
- texto_logo: se veio imagem, o texto que aparece no logo (senão vazio).
Se a marca tem siglas, mantenha a sigla como termo.`;

const SISTEMA_PARECER = `Você é advogado especialista em marcas (Lei 9.279/96, art. 124, especialmente incisos V, VI e XIX) e escreve um parecer de viabilidade de registro no INPI, em português do Brasil, linguagem clara para o cliente.
Recebe a marca pretendida, as classes e as anterioridades encontradas no INPI (com relevância 0–100 calculada por semelhança gráfica/fonética).
Avalie colidência por semelhança gráfica, fonética e ideológica E afinidade mercadológica (mesma classe ou classes afins). Marcas arquivadas, extintas ou indeferidas pesam pouco.
Devolva: risco geral (baixo, medio ou alto), resumo (3 a 5 frases), análise por classe (risco e comentário), as anterioridades realmente relevantes (no máximo 10, com o motivo) e recomendações práticas (2 a 5).
Nunca invente processos: use só os da lista.`;

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
    model: MODELOS.leitura,
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

  // 2) anterioridades no INPI (radical de cada termo, devagar)
  const achados = new Map<string, ResultadoBusca>();
  try {
    for (const [i, t] of termos.entries()) {
      if (i > 0) await pausa(4_000);
      for (const r of (await buscarNomeNoInpi(t, true)).resultados) achados.set(r.processo, r);
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

  // 3) parecer
  const lista = [...extras, ...candidatos].map((r) => `${r.processo} | ${r.marca} | classe ${r.classes} | ${r.situacao} | ${r.titular} | relevância ${r.relevancia}`).join("\n");
  const parecer = await generateJson<Parecer>({
    system: SISTEMA_PARECER,
    parts: [{ text: `Marca pretendida: ${ref}${e.siglas ? " (contém siglas)" : ""}\nOnde será usada: ${e.ondeUsar}\nContexto: ${e.contexto || "-"}\nClasses: ${classes.map((c) => `${c.classe} (${c.motivo})`).join("; ")}\n\nAnterioridades encontradas no INPI (${candidatos.length + extras.length}):\n${lista || "nenhuma"}` }],
    model: MODELOS.leitura,
    schema: {
      type: "object",
      properties: {
        risco: { type: "string", enum: ["baixo", "medio", "alto"] },
        resumo: { type: "string" },
        classes: { type: "array", items: { type: "object", properties: { classe: { type: "string" }, motivo: { type: "string" }, risco: { type: "string", enum: ["baixo", "medio", "alto"] }, comentario: { type: "string" } }, required: ["classe", "motivo", "risco", "comentario"] } },
        anterioridades: {
          type: "array",
          items: {
            type: "object",
            properties: { processo: { type: "string" }, marca: { type: "string" }, classe: { type: "string" }, situacao: { type: "string" }, titular: { type: "string" }, relevancia: { type: "number" }, motivo: { type: "string" } },
            required: ["processo", "marca", "classe", "situacao", "titular", "relevancia", "motivo"],
          },
        },
        recomendacoes: { type: "array", items: { type: "string" } },
      },
      required: ["risco", "resumo", "classes", "anterioridades", "recomendacoes"],
    },
  });
  if (!parecer.ok) return { ok: false, error: parecer.error };
  // só processos que vieram do INPI (a IA não inventa número)
  const validos = new Set([...candidatos, ...extras].map((r) => r.processo));
  const resultado = { ...parecer.data, anterioridades: parecer.data.anterioridades.filter((a) => validos.has(a.processo)), termos, encontrados: candidatos };

  const { data, error } = await db()
    .from("marca_buscas")
    .insert({ nome: ref, entrada: { nome, siglas: e.siglas, ondeUsar: e.ondeUsar, contexto: e.contexto, textoLogo }, resultado, criado_por: profile.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "A busca foi feita, mas não consegui guardar no histórico (a tabela marca_buscas existe? rode a migration 0062)." };
  return { ok: true, id: data.id as string };
}
