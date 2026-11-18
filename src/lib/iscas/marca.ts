import "server-only";
import { consultarBase, situacaoDoDespacho, type LinhaBase } from "@/lib/marcas/base";
import { parecencaNome, variantesDoNome } from "@/lib/marcas/fonetica";
import type { Ramo } from "./ramos";

// Isca "Sua marca pode ser registrada?" (18/11/2026): prévia grátis e rápida, sem IA.
// Procura na base própria das revistas do INPI (VPS) o nome, grafias parecidas e
// radicais nas classes do ramo, mede a parecença como o examinador olha e dá um
// risco indicativo. O relatório completo (Busca com IA) a equipe faz pelo lead.

export type Parecida = { marca: string; classe: string; situacao: string; parecenca: number };
export type PreviaMarca = { risco: "baixo" | "medio" | "alto"; parecidas: Parecida[]; total: number; classes: string[] };

const MORTA = /extinto|arquivado|indeferido|nulo/i;

export async function previaMarca(nome: string, ramo: Ramo): Promise<PreviaMarca> {
  const termo = nome.trim().toUpperCase();
  const buscas: Promise<LinhaBase[]>[] = [];
  const pega = (tipo: "exata" | "radical", t: string, classe: string) =>
    consultarBase(tipo, t, classe, 60, 9_000)
      .then((r) => r.resultados)
      .catch(() => [] as LinhaBase[]);
  for (const classe of ramo.classes) {
    buscas.push(pega("exata", termo, classe), pega("radical", termo, classe));
  }
  // grafias que soam igual (PLLIF → PLIF, PLIFF…) só na classe principal
  for (const v of variantesDoNome(termo).slice(0, 4)) buscas.push(pega("radical", v, ramo.classes[0]));

  const vistas = new Map<string, Parecida>();
  for (const linhas of await Promise.all(buscas)) {
    for (const l of linhas) {
      if (!l.marca || vistas.has(l.numero)) continue;
      const situacao = situacaoDoDespacho(l.ultimo_despacho, l.concessao);
      if (MORTA.test(situacao)) continue;
      const parecenca = parecencaNome(termo, l.marca);
      if (parecenca < 0.55) continue;
      const classe = (l.classes ?? "").split(/[^0-9]+/).find((c) => ramo.classes.includes(c)) ?? ramo.classes[0];
      vistas.set(l.numero, { marca: l.marca, classe, situacao, parecenca: Math.round(parecenca * 100) / 100 });
    }
  }
  const lista = [...vistas.values()].sort((a, b) => b.parecenca - a.parecenca);
  const topo = lista[0]?.parecenca ?? 0;
  const risco = topo >= 0.85 ? "alto" : topo >= 0.65 || lista.length >= 6 ? "medio" : "baixo";
  return { risco, parecidas: lista.slice(0, 3), total: lista.length, classes: ramo.classes };
}

/** Limite por aparelho/IP: no máximo N prévias por dia (protege a base e os robôs). */
export const PREVIAS_POR_DIA = 5;
