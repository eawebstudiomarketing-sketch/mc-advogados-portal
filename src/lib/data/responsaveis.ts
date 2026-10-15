import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `clientes`: empresas que a pessoa acompanha (null = todas: administradores e
 * responsáveis sem login). Qualquer um pode ser responsável em qualquer
 * empresa; isto só separa "Equipe desta empresa" de "Outros da equipe".
 */
export type Responsavel = { id: string; nome: string; email: string; temLogin: boolean; clientes: string[] | null };

/** Quem pode responder por atividades: equipe com login + cadastrados só com nome e Gmail. */
export async function listResponsaveis(): Promise<Responsavel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("responsaveis").select("id, nome, email, profile_id").order("nome");
  if (error) throw error;

  // papéis e designações de todos (só nomes/ids; a lista acima já
  // veio filtrada pelas regras do banco)
  const ids = data.map((r) => r.profile_id).filter((x): x is string => !!x);
  const db = createAdminClient();
  const [{ data: perfis }, { data: designacoes }] = ids.length
    ? await Promise.all([
        db.from("profiles").select("id, role").in("id", ids),
        db.from("equipe_clientes").select("profile_id, client_id").in("profile_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  return data.map((r) => {
    let clientes: string[] | null = null;
    const perfil = perfis?.find((p) => p.id === r.profile_id);
    if (perfil?.role === "advogado") clientes = (designacoes ?? []).filter((d) => d.profile_id === r.profile_id).map((d) => d.client_id);
    return { id: r.id, nome: r.nome, email: r.email, temLogin: !!r.profile_id, clientes };
  });
}

/** Responsável correspondente ao perfil logado (padrão ao criar atividade). */
export async function responsavelDoPerfil(profileId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("responsaveis").select("id").eq("profile_id", profileId).maybeSingle();
  return data?.id ?? null;
}
