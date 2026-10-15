import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPush } from "@/lib/push";

// Avisos de cada pessoa da equipe (sininho do menu + aviso no celular para
// quem ativou). O gatilho do banco também cria avisos ("você virou
// responsável") — ver migration 0022.

export type NovoAviso = { profile_id: string; tipo: string; titulo: string; corpo?: string | null; url?: string | null };

export async function criarAvisos(avisos: NovoAviso[]): Promise<void> {
  if (!avisos.length) return;
  const { error } = await createAdminClient().from("avisos").insert(avisos);
  if (error) console.error("avisos:", error.message);
  // aviso no celular: não pode travar quem comentou se o push falhar
  await Promise.all(
    avisos.map((a) =>
      enviarPush([a.profile_id], { titulo: a.titulo, corpo: a.corpo ?? "", url: a.url ?? "/admin", tag: `${a.tipo}-${a.url ?? ""}` }).catch(() => 0)
    )
  );
}
