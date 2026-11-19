import "server-only";
import { consultarBase, situacaoDoDespacho, type LinhaBase } from "@/lib/marcas/base";
import { parecencaNome, variantesDoNome } from "@/lib/marcas/fonetica";

// Isca "Sua marca está livre?" (18/11/2026): prévia grátis e rápida, sem IA.
// Procura na base própria das revistas do INPI (VPS) o nome, grafias parecidas e
// radicais nas classes do ramo, mede a parecença como o examinador olha e dá um
// risco indicativo. 19/11/2026: devolve dados de relatório (processo, titular,
// depósito, contagem por classe) para a tela mostrar uma prévia do Relatório de Viabilidade.

export type Parecida = { marca: string; classe: string; situacao: string; parecenca: number; processo: string; titular: string; deposito: string | null; apresentacao: string | null };
export type PorClasse = { classe: string; total: number; maior: number };
export type PreviaMarca = { risco: "baixo" | "medio" | "alto"; parecidas: Parecida[]; total: number; classes: string[]; porClasse: PorClasse[]; identicas: number; registradas: number };

const MORTA = /extinto|arquivado|indeferido|nulo/i;

export async function previaMarca(nome: string, classes: string[]): Promise<PreviaMarca> {
  const termo = nome.trim().toUpperCase();
  const buscas: Promise<LinhaBase[]>[] = [];
  const pega = (tipo: "exata" | "radical", t: string, classe: string) =>
    consultarBase(tipo, t, classe, 60, 9_000)
      .then((r) => r.resultados)
      .catch(() => [] as LinhaBase[]);
  for (const classe of classes) buscas.push(pega("exata", termo, classe), pega("radical", termo, classe));
  // grafias que soam igual (PLLIF → PLIF, PLIFF…) só na classe principal
  for (const v of variantesDoNome(termo).slice(0, 4)) buscas.push(pega("radical", v, classes[0]));

  const vistas = new Map<string, Parecida>();
  for (const linhas of await Promise.all(buscas)) {
    for (const l of linhas) {
      if (!l.marca || vistas.has(l.numero)) continue;
      const situacao = situacaoDoDespacho(l.ultimo_despacho, l.concessao);
      if (MORTA.test(situacao)) continue;
      const parecenca = parecencaNome(termo, l.marca);
      if (parecenca < 0.55) continue;
      const classe = (l.classes ?? "").split(/[^0-9]+/).find((c) => classes.includes(c)) ?? classes[0];
      vistas.set(l.numero, {
        marca: l.marca,
        classe,
        situacao,
        parecenca: Math.round(parecenca * 100) / 100,
        processo: l.numero,
        titular: (l.titular ?? "").slice(0, 80),
        deposito: l.deposito,
        apresentacao: l.apresentacao,
      });
    }
  }
  const lista = [...vistas.values()].sort((a, b) => b.parecenca - a.parecenca);
  const topo = lista[0]?.parecenca ?? 0;
  const risco = topo >= 0.85 ? "alto" : topo >= 0.65 || lista.length >= 6 ? "medio" : "baixo";
  const porClasse = classes.map((c) => {
    const da = lista.filter((p) => p.classe === c);
    return { classe: c, total: da.length, maior: da[0]?.parecenca ?? 0 };
  });
  return {
    risco,
    parecidas: lista.slice(0, 5),
    total: lista.length,
    classes,
    porClasse,
    identicas: lista.filter((p) => p.parecenca >= 0.85).length,
    registradas: lista.filter((p) => /vigor|deferido/i.test(p.situacao)).length,
  };
}

/** Limite por aparelho/IP: no máximo N prévias por dia (protege a base e os robôs). */
export const PREVIAS_POR_DIA = 5;
