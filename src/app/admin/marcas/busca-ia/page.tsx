import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { FormBuscaIA } from "./form-busca-ia";

// Viabilidade → Busca com IA (como no Marca Acompanhada): pesquisa + histórico
// de buscas anteriores (reabrir / PDF). Sem créditos: o custo é só a IA.
export const maxDuration = 300;

const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" }).format(new Date(iso));

export default async function BuscaIAPage() {
  await exigirPermissao("marcas");
  const sb = (await createClient()) as unknown as SupabaseClient;
  const { data: historico, error } = await sb.from("marca_buscas").select("id, nome, created_at, resultado->risco").order("created_at", { ascending: false }).limit(50);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Busca com IA</h1>
        <p className="mt-1 text-sm text-muted">Analise a viabilidade da sua marca e consulte seu histórico de buscas.</p>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        <FormBuscaIA />
        <section className="ui-card overflow-hidden">
          <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">Histórico de buscas anteriores</h2>
          <ul className="max-h-[640px] divide-y divide-border overflow-y-auto">
            {error && <li className="px-5 py-4 text-sm text-muted">O histórico aparece depois que a tabela marca_buscas for criada (migration 0062).</li>}
            {!error && !historico?.length && <li className="px-5 py-4 text-sm text-muted">Nenhuma busca ainda.</li>}
            {(historico ?? []).map((h) => (
              <li key={h.id as string} className="px-5 py-3">
                <p className="text-sm font-semibold text-foreground">{h.nome as string}</p>
                <p className="text-xs text-muted">em {quando(h.created_at as string)}</p>
                <div className="mt-1 flex gap-3 text-sm">
                  <Link href={`/admin/marcas/busca-ia/${h.id}`} className="text-navy-3 hover:underline">
                    Reabrir
                  </Link>
                  <Link href={`/admin/marcas/busca-ia/${h.id}?imprimir=1`} className="text-navy-3 hover:underline">
                    PDF
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
