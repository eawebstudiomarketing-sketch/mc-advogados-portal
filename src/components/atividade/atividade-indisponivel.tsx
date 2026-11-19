import Link from "next/link";
import { SearchX } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// 19/11/2026: a Talita abriu uma atividade que o Maurício tinha passado para ele de manhã e caiu
// numa tela branca "404 This page could not be found" (sem menu, em inglês). Ela deixou de ver a
// atividade porque não é mais responsável nem envolvida (RLS), não porque o portal quebrou.
// Agora a tela explica o que houve e leva de volta para Atividades.

export async function AtividadeIndisponivel({ id }: { id: string }) {
  const db = createAdminClient() as unknown as SupabaseClient;
  const { data: a } = await db.from("activities").select("title, responsavel_id").eq("id", id).maybeSingle();
  let quem: string | null = null;
  if (a?.responsavel_id) {
    const { data: r } = await db.from("responsaveis").select("nome").eq("id", a.responsavel_id).maybeSingle();
    quem = (r?.nome as string | undefined) ?? null;
  }
  return (
    <div className="mx-auto mt-10 max-w-lg">
      <div className="ui-card p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
          <SearchX className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-lg font-bold text-foreground">{a ? "Esta atividade não está mais com você" : "Esta atividade não existe mais"}</h1>
        <p className="mt-2 text-sm text-foreground/80">
          {a ? (
            <>
              <b>“{a.title as string}”</b> foi passada para {quem ? <b>{quem}</b> : "outra pessoa"}. Por isso ela saiu da sua lista. Se ainda precisar dela, peça para incluírem você como envolvido.
            </>
          ) : (
            "Ela foi excluída ou o link está errado."
          )}
        </p>
        <Link href="/admin/activities" className="ui-btn mt-5 inline-flex">
          Voltar para Atividades
        </Link>
      </div>
    </div>
  );
}
