import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type PublicacaoStatus = "nao_tratada" | "tratada" | "descartada";
export type Publicacao = Database["public"]["Tables"]["publicacoes"]["Row"] & {
  clients: { id: string; name: string } | null;
  processes: { id: string; numero_processo: string; profiles: { full_name: string } | null } | null;
};

export const STATUS_PUBLICACAO: Record<PublicacaoStatus, string> = {
  nao_tratada: "Não tratada",
  tratada: "Tratada",
  descartada: "Descartada",
};

const CAMPOS = "*, clients(id, name), processes(id, numero_processo, profiles(full_name))";

export async function listPublicacoes(filtro: {
  status?: PublicacaoStatus | "todas";
  tribunal?: string;
  uf?: string;
  de?: string;
  ate?: string;
  busca?: string;
  limite?: number;
}): Promise<Publicacao[]> {
  const supabase = await createClient();
  let q = supabase.from("publicacoes").select(CAMPOS).order("data_disponibilizacao", { ascending: false }).order("created_at", { ascending: false });
  if (filtro.status && filtro.status !== "todas") q = q.eq("status", filtro.status);
  if (filtro.tribunal) q = q.eq("tribunal", filtro.tribunal);
  if (filtro.uf) q = q.eq("uf", filtro.uf);
  if (filtro.de && /^\d{4}-\d{2}-\d{2}$/.test(filtro.de)) q = q.gte("data_disponibilizacao", filtro.de);
  if (filtro.ate && /^\d{4}-\d{2}-\d{2}$/.test(filtro.ate)) q = q.lte("data_disponibilizacao", filtro.ate);
  const busca = filtro.busca?.trim();
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    q = digitos.length >= 7
      ? q.like("numero_processo", `%${digitos}%`)
      : q.ilike("texto", `%${busca.replace(/[%_,()]/g, " ")}%`);
  }
  const { data } = await q.limit(filtro.limite ?? 100);
  return (data ?? []) as unknown as Publicacao[];
}

export async function listPublicacoesDoProcesso(processId: string): Promise<Publicacao[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("publicacoes").select(CAMPOS).eq("process_id", processId).order("data_disponibilizacao", { ascending: false });
  return (data ?? []) as unknown as Publicacao[];
}

export async function getPublicacao(id: string): Promise<Publicacao | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("publicacoes").select(CAMPOS).eq("id", id).maybeSingle();
  return (data as unknown as Publicacao) ?? null;
}

/** Contadores do topo: pendentes no total e o que aconteceu hoje. */
export async function contadoresPublicacoes() {
  const supabase = await createClient();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const inicioHoje = `${hoje}T00:00:00-03:00`;
  const contar = async (aplicar: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count } = await aplicar(base());
    return count ?? 0;
  };
  const base = () => supabase.from("publicacoes").select("id", { count: "exact", head: true });
  const [pendentes, recebidasHoje, tratadasHoje, descartadasHoje, tribunais] = await Promise.all([
    contar((q) => q.eq("status", "nao_tratada")),
    contar((q) => q.gte("created_at", inicioHoje)),
    contar((q) => q.eq("status", "tratada").gte("tratada_em", inicioHoje)),
    contar((q) => q.eq("status", "descartada").gte("tratada_em", inicioHoje)),
    supabase.from("publicacoes").select("tribunal, uf").limit(2000),
  ]);
  const linhas = (tribunais.data ?? []) as { tribunal: string | null; uf: string | null }[];
  const listaTribunais = [...new Set(linhas.map((t) => t.tribunal).filter(Boolean) as string[])].sort();
  const listaUfs = [...new Set(linhas.map((t) => t.uf).filter(Boolean) as string[])].sort();
  return { pendentes, recebidasHoje, tratadasHoje, descartadasHoje, tribunais: listaTribunais, ufs: listaUfs };
}

/** Só o número de não tratadas (sininho do admin no menu). */
export async function contarNaoTratadas(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("publicacoes").select("id", { count: "exact", head: true }).eq("status", "nao_tratada");
  return count ?? 0;
}
