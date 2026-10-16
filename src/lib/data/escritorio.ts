import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Configuração do escritório (áreas de atuação, textos dos lembretes ao
// cliente) e as pessoas que podem ser responsáveis, com telefone e áreas.

export type EscritorioConfig = {
  areas: string[];
  lembrete_24h: string;
  lembrete_1h: string;
  lembretes_ativos: boolean;
  rotina_ativa: boolean;
};

const PADRAO: EscritorioConfig = {
  areas: ["Trabalhista", "Empresarial", "Contratos", "Marcas e Patentes", "Tributário", "Cível", "Consumidor", "Previdenciário"],
  lembrete_24h: "Olá! Passando para lembrar: amanhã, {data}, às {hora}, temos {titulo} com a MC Advogados.{local}",
  lembrete_1h: "Olá! Daqui a 1 hora, às {hora}, temos {titulo} com a MC Advogados.{local} Até já!",
  lembretes_ativos: true,
  rotina_ativa: true,
};

export async function getEscritorioConfig(): Promise<EscritorioConfig> {
  const { data } = await createAdminClient()
    .from("escritorio_config")
    .select("areas, lembrete_24h, lembrete_1h, lembretes_ativos, rotina_ativa")
    .eq("id", 1)
    .maybeSingle();
  return data ?? PADRAO;
}

export type Pessoa = {
  id: string; // id em responsaveis
  nome: string;
  email: string;
  profileId: string | null;
  papel: "admin" | "advogado" | null; // null = sem login
  telefone: string | null;
  areas: string[];
  rotinaZap: boolean;
};

/** Todos os responsáveis (com e sem login), sem as contas técnicas ocultas. */
export async function listPessoas(): Promise<Pessoa[]> {
  const db = createAdminClient();
  const [{ data: resp }, { data: perfis }] = await Promise.all([
    db.from("responsaveis").select("id, nome, email, profile_id, telefone, areas, rotina_zap").order("nome"),
    db.from("profiles").select("id, role, ativo, oculto").in("role", ["admin", "advogado"]),
  ]);
  return (resp ?? [])
    .map((r) => {
      const p = perfis?.find((x) => x.id === r.profile_id);
      return { r, p };
    })
    .filter(({ r, p }) => !r.profile_id || (p && !p.oculto && p.ativo))
    .map(({ r, p }) => ({
      id: r.id,
      nome: r.nome,
      email: r.email,
      profileId: r.profile_id,
      papel: (p?.role as "admin" | "advogado" | undefined) ?? null,
      telefone: r.telefone,
      areas: r.areas ?? [],
      rotinaZap: r.rotina_zap,
    }));
}

/**
 * Responsável sugerido para uma área: quem tem a área, com menos atividades
 * em aberto (divide o trabalho). Sem ninguém na área, devolve null.
 */
export async function sugerirResponsavel(area: string | null, pessoas?: Pessoa[]): Promise<string | null> {
  if (!area) return null;
  const lista = (pessoas ?? (await listPessoas())).filter((p) => p.areas.some((a) => a.toLowerCase() === area.toLowerCase()));
  if (lista.length <= 1) return lista[0]?.id ?? null;
  const { data } = await createAdminClient()
    .from("activities")
    .select("responsavel_id")
    .in("status", ["aberta", "em_andamento"])
    .is("archived_at", null)
    .in(
      "responsavel_id",
      lista.map((p) => p.id)
    );
  const carga = new Map(lista.map((p) => [p.id, 0]));
  for (const a of data ?? []) if (a.responsavel_id) carga.set(a.responsavel_id, (carga.get(a.responsavel_id) ?? 0) + 1);
  return [...carga.entries()].sort((a, b) => a[1] - b[1])[0][0];
}
