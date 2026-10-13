import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `clientes`: em quais clientes a pessoa pode ser responsável (null = em
 * qualquer um: administradores, responsáveis sem login e advogados com a
 * exceção "atividades em que é responsável" ligada).
 */
export type Responsavel = { id: string; nome: string; email: string; temLogin: boolean; clientes: string[] | null };

/** Quem pode responder por atividades: equipe com login + cadastrados só com nome e Gmail. */
export async function listResponsaveis(): Promise<Responsavel[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("responsaveis").select("id, nome, email, profile_id").order("nome");
  if (error) throw error;

  // papéis, designações e exceções de todos (só nomes/ids; a lista acima já
  // veio filtrada pelas regras do banco)
  const ids = data.map((r) => r.profile_id).filter((x): x is string => !!x);
  const db = createAdminClient();
  const [{ data: perfis }, { data: designacoes }, { data: perms }] = ids.length
    ? await Promise.all([
        db.from("profiles").select("id, role").in("id", ids),
        db.from("equipe_clientes").select("profile_id, client_id").in("profile_id", ids),
        db.from("equipe_permissoes").select("profile_id, permissoes").in("profile_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return data.map((r) => {
    let clientes: string[] | null = null;
    const perfil = perfis?.find((p) => p.id === r.profile_id);
    if (perfil?.role === "advogado") {
      const p = perms?.find((x) => x.profile_id === r.profile_id)?.permissoes as Record<string, unknown> | undefined;
      clientes = p?.atividades_como_responsavel === true ? null : (designacoes ?? []).filter((d) => d.profile_id === r.profile_id).map((d) => d.client_id);
    }
    return { id: r.id, nome: r.nome, email: r.email, temLogin: !!r.profile_id, clientes };
  });
}

/** Responsável correspondente ao perfil logado (padrão ao criar atividade). */
export async function responsavelDoPerfil(profileId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("responsaveis").select("id").eq("profile_id", profileId).maybeSingle();
  return data?.id ?? null;
}
