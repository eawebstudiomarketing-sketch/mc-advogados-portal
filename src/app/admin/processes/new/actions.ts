"use server";

import { revalidatePath } from "next/cache";
import { requireRole, temPermissao } from "@/lib/dal";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROCESS_AREAS, type ProcessArea } from "@/lib/process-area";
import { djenPorNome, djenPorOab, mascaraCnj, nomePeloCnpj, type ProcessoAchado } from "@/lib/processos-busca/fontes";
import { abrirCandidato, aprovarCandidato, descartarCandidato, getCandidato, lerDeNovo, type Candidato } from "@/lib/processos-busca/candidatos";

export type TipoBusca = "numero" | "nome" | "oab" | "documento";

/** Processo da lista com a situação dele no portal. */
export type Achado = ProcessoAchado & { processId: string | null; candidatoId: string | null; candidatoStatus: Candidato["status"] | null };

export type ResultadoBusca =
  | { erro: string }
  | { tipo: "numero"; jaNoPortal: string | null; candidato: Candidato | null }
  | { tipo: "lista"; itens: Achado[]; buscouPor: string };

async function equipeComProcessos() {
  const profile = await requireRole(["admin", "advogado"]);
  if (!(await temPermissao("processos"))) throw new Error("Você não tem acesso a Processos.");
  return profile;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Marca, em cada achado, se o processo já está no portal ou aguardando aprovação. */
async function situacao(itens: ProcessoAchado[]): Promise<Achado[]> {
  if (!itens.length) return [];
  // processos_candidatos ainda não está nos tipos gerados (migration 0057)
  const db = createAdminClient() as unknown as SupabaseClient;
  const dig = itens.map((i) => i.digitos);
  const [{ data: procs }, { data: cands }] = await Promise.all([
    db.from("processes").select("id, numero_digitos").in("numero_digitos", dig),
    db.from("processos_candidatos").select("id, numero_digitos, status").in("numero_digitos", dig).in("status", ["lendo", "pronto", "erro"]),
  ]);
  const p = new Map((procs ?? []).map((x) => [x.numero_digitos as string, x.id as string]));
  const c = new Map((cands ?? []).map((x) => [x.numero_digitos as string, x]));
  return itens.map((i) => ({ ...i, processId: p.get(i.digitos) ?? null, candidatoId: c.get(i.digitos)?.id ?? null, candidatoStatus: (c.get(i.digitos)?.status as Candidato["status"]) ?? null }));
}

export async function pesquisarAction(tipo: TipoBusca, termo: string, uf?: string): Promise<ResultadoBusca> {
  try {
    const profile = await equipeComProcessos();
    const t = termo.trim();
    if (!t) return { erro: "Digite o que pesquisar." };

    if (tipo === "numero") {
      if (!mascaraCnj(t)) return { erro: "O número CNJ tem 20 dígitos (0000000-00.0000.0.00.0000). Confira e tente de novo." };
      const r = await abrirCandidato(t, "busca", profile.id);
      revalidatePath("/admin/processes/new");
      return "jaNoPortal" in r ? { tipo: "numero", jaNoPortal: r.jaNoPortal, candidato: null } : { tipo: "numero", jaNoPortal: null, candidato: r.candidato };
    }

    if (tipo === "nome") {
      if (t.length < 4) return { erro: "Digite o nome completo (ou pelo menos nome e sobrenome)." };
      return { tipo: "lista", itens: await situacao(await djenPorNome(t)), buscouPor: t };
    }

    if (tipo === "oab") {
      const num = t.replace(/\D/g, "");
      const u = (uf ?? "").trim().toUpperCase();
      if (!num || u.length !== 2) return { erro: "Informe o número da OAB e a UF (ex.: 12345 e BA)." };
      return { tipo: "lista", itens: await situacao(await djenPorOab(num, u)), buscouPor: `OAB ${num}/${u}` };
    }

    // CPF/CNPJ: o diário oficial só busca por nome. Acha o nome pelo cadastro do portal (CPF ou CNPJ)
    // ou, para CNPJ, pela Receita (BrasilAPI), e pesquisa por esse nome.
    const dig = t.replace(/\D/g, "");
    if (dig.length !== 11 && dig.length !== 14) return { erro: "CPF tem 11 dígitos e CNPJ tem 14." };
    const { data: clientes } = await createAdminClient().from("clients").select("name, documento").not("documento", "is", null).limit(5000);
    let nome = (clientes ?? []).find((c) => (c.documento ?? "").replace(/\D/g, "") === dig)?.name ?? null;
    if (!nome && dig.length === 14) nome = await nomePeloCnpj(dig);
    if (!nome) {
      return {
        erro:
          dig.length === 11
            ? "Esse CPF não está no cadastro de nenhum cliente do portal, e os tribunais não deixam pesquisar CPF de fora. Pesquise pelo nome da pessoa."
            : "Não achei a empresa desse CNPJ. Pesquise pelo nome da empresa.",
      };
    }
    return { tipo: "lista", itens: await situacao(await djenPorNome(nome)), buscouPor: `${nome} (${dig.length === 11 ? "CPF" : "CNPJ"} ${t})` };
  } catch (e) {
    return { erro: msg(e) };
  }
}

/** Manda para conferência (robô lê no tribunal) os processos marcados numa lista. */
export async function conferirVariosAction(numeros: string[]): Promise<{ erro?: string; abertos: number; jaNoPortal: number; falhas: string[] }> {
  try {
    const profile = await equipeComProcessos();
    const lista = [...new Set(numeros)].slice(0, 30);
    let abertos = 0;
    let jaNoPortal = 0;
    const falhas: string[] = [];
    for (const n of lista) {
      try {
        const r = await abrirCandidato(n, "busca", profile.id);
        if ("jaNoPortal" in r) jaNoPortal++;
        else abertos++;
      } catch (e) {
        falhas.push(`${n}: ${msg(e)}`);
      }
    }
    revalidatePath("/admin/processes/new");
    return { abertos, jaNoPortal, falhas };
  } catch (e) {
    return { erro: msg(e), abertos: 0, jaNoPortal: 0, falhas: [] };
  }
}

/** Situação atual de candidatos (a tela pergunta enquanto o robô está lendo). */
export async function candidatosAction(ids: string[]): Promise<Candidato[]> {
  await equipeComProcessos();
  const out: Candidato[] = [];
  for (const id of ids.slice(0, 50)) {
    const c = await getCandidato(id);
    if (c) out.push(c);
  }
  return out;
}

export async function aprovarAction(
  id: string,
  opcoes: { clientId?: string | null; area?: string | null; responsavelEu?: boolean }
): Promise<{ erro?: string; processId?: string; andamentos?: number; lendo?: boolean }> {
  try {
    const profile = await equipeComProcessos();
    const area = opcoes.area && PROCESS_AREAS.includes(opcoes.area as ProcessArea) ? (opcoes.area as ProcessArea) : null;
    const r = await aprovarCandidato(id, { clientId: opcoes.clientId || null, area, responsibleId: opcoes.responsavelEu === false ? null : profile.id }, profile.id);
    revalidatePath("/admin/processes");
    revalidatePath("/admin/processes/new");
    revalidatePath("/admin/publicacoes");
    return r;
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function aprovarVariosAction(ids: string[]): Promise<{ aprovados: number; falhas: string[] }> {
  const profile = await equipeComProcessos();
  let aprovados = 0;
  const falhas: string[] = [];
  for (const id of ids.slice(0, 50)) {
    try {
      await aprovarCandidato(id, { clientId: null, area: null, responsibleId: profile.id }, profile.id);
      aprovados++;
    } catch (e) {
      falhas.push(msg(e));
    }
  }
  revalidatePath("/admin/processes");
  revalidatePath("/admin/processes/new");
  return { aprovados, falhas };
}

export async function descartarAction(id: string): Promise<{ erro?: string }> {
  try {
    const profile = await equipeComProcessos();
    await descartarCandidato(id, profile.id);
    revalidatePath("/admin/processes/new");
    return {};
  } catch (e) {
    return { erro: msg(e) };
  }
}

export async function lerDeNovoAction(id: string): Promise<{ erro?: string }> {
  try {
    await equipeComProcessos();
    await lerDeNovo(id);
    revalidatePath("/admin/processes/new");
    return {};
  } catch (e) {
    return { erro: msg(e) };
  }
}
