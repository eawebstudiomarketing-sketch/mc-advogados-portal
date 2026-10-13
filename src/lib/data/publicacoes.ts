import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type PublicacaoStatus = "nao_tratada" | "tratada" | "descartada";
export type Publicacao = Database["public"]["Tables"]["publicacoes"]["Row"] & {
  clients: { id: string; name: string } | null;
  processes: { id: string; numero_processo: string } | null;
};

export const STATUS_PUBLICACAO: Record<PublicacaoStatus, string> = {
  nao_tratada: "Não tratada",
  tratada: "Tratada",
  descartada: "Descartada",
};

const CAMPOS = "*, clients(id, name), processes(id, numero_processo)";

export async function listPublicacoes(filtro: {
  status?: PublicacaoStatus | "todas";
  tribunal?: string;
  busca?: string;
  limite?: number;
}): Promise<Publicacao[]> {
  const supabase = await createClient();
  let q = supabase.from("publicacoes").select(CAMPOS).order("data_disponibilizacao", { ascending: false }).order("created_at", { ascending: false });
  if (filtro.status && filtro.status !== "todas") q = q.eq("status", filtro.status);
  if (filtro.tribunal) q = q.eq("tribunal", filtro.tribunal);
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
    supabase.from("publicacoes").select("tribunal").not("tribunal", "is", null).limit(1000),
  ]);
  const listaTribunais = [...new Set((tribunais.data ?? []).map((t) => t.tribunal as string))].sort();
  return { pendentes, recebidasHoje, tratadasHoje, descartadasHoje, tribunais: listaTribunais };
}
