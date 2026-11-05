import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Dono da publicação (05/11/2026). Só a OAB do Maurício é monitorada, então
// toda publicação do escritório chega; cada advogada vê por padrão as dela.
// Ordem: quem recebeu por "Encaminhar" > responsável do processo > nome do
// responsável que veio do Astrea (a maioria dos processos só tem o nome).

export type DonoFiltro = "minhas" | "sem" | "todas";
export type PessoaEquipe = { id: string; nome: string };

type PubDono = {
  responsavel_id?: string | null;
  responsavel_nome?: string | null;
  processes?: { responsible_id?: string | null; responsavel_nome?: string | null } | null;
};

const TITULOS = new Set(["dr", "dra", "doutor", "doutora"]);
const palavras = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !TITULOS.has(w));

/** Equipe que pode receber publicação (admin e advogados ativos, sem contas ocultas). */
export async function pessoasDaEquipe(): Promise<PessoaEquipe[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name, ativo, oculto")
    .in("role", ["admin", "advogado"])
    .eq("ativo", true)
    .order("full_name");
  return (data ?? []).filter((p) => !p.oculto && p.full_name).map((p) => ({ id: p.id, nome: p.full_name! }));
}

/** Acha a pessoa pelo nome do Astrea ("MAURICIO O.", "TALITA DUARTE", "Dra. Franciele"): mesmo 1º nome e sobrenome compatível. */
function pessoaPorNome(nome: string | null | undefined, equipe: PessoaEquipe[]): string | null {
  const alvo = palavras(nome ?? "");
  if (!alvo.length) return null;
  const candidatas = equipe.filter((p) => palavras(p.nome)[0] === alvo[0]);
  if (candidatas.length <= 1) return candidatas[0]?.id ?? null;
  const resto = alvo.slice(1);
  const certa = candidatas.find((p) => palavras(p.nome).slice(1).some((w) => resto.some((r) => w.startsWith(r) || r.startsWith(w))));
  return certa?.id ?? null;
}

export function donoDe(p: PubDono, equipe: PessoaEquipe[]): string | null {
  return (
    p.responsavel_id ??
    p.processes?.responsible_id ??
    pessoaPorNome(p.processes?.responsavel_nome, equipe) ??
    pessoaPorNome(p.responsavel_nome, equipe)
  );
}

export function filtrarPorDono<T extends PubDono>(lista: T[], filtro: DonoFiltro, profileId: string, equipe: PessoaEquipe[]): T[] {
  if (filtro === "todas") return lista;
  return lista.filter((p) => {
    const dono = donoDe(p, equipe);
    return filtro === "minhas" ? dono === profileId : !dono;
  });
}

export function contarPorDono(lista: PubDono[], profileId: string, equipe: PessoaEquipe[]) {
  let minhas = 0;
  let sem = 0;
  for (const p of lista) {
    const dono = donoDe(p, equipe);
    if (dono === profileId) minhas++;
    else if (!dono) sem++;
  }
  return { minhas, sem, todas: lista.length };
}

/** Advogado abre em "Minhas"; o admin abre em "Todas". */
export function filtroDono(valor: string | undefined, role: string): DonoFiltro {
  if (valor === "minhas" || valor === "todas") return valor;
  if (valor === "sem" && role === "admin") return "sem";
  return role === "admin" ? "todas" : "minhas";
}
