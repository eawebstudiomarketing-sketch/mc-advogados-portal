import { Sparkles } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { listarNovidades } from "@/lib/novidades";
import { ItemDaNovidade } from "@/components/novidades/janela-novidades";

// Novidades (04/11/2026): tudo o que mudou no portal, a mais nova em cima, com
// prints e como usar. A mais nova também abre sozinha uma vez para cada pessoa.

export default async function NovidadesPage() {
  await requireRole(["admin", "advogado"]);
  const novidades = await listarNovidades();
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="page-title flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold-ink" aria-hidden /> Novidades
        </h1>
        <p className="mt-1 text-sm text-muted">O que mudou no portal e como usar. A novidade mais nova abre sozinha uma vez; aqui ficam todas.</p>
      </div>
      {novidades.length === 0 ? (
        <p className="ui-card p-6 text-sm text-muted">Nenhuma novidade ainda.</p>
      ) : (
        <div className="space-y-5">
          {novidades.map((n, i) => (
            <details key={n.id} open={i === 0} className="ui-card p-5">
              <summary className="cursor-pointer list-none">
                <p className="eyebrow">{new Date(n.publicada_em).toLocaleDateString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "long", year: "numeric" })}</p>
                <h2 className="section-title !text-lg">{n.titulo}</h2>
                {n.resumo && <p className="text-sm text-muted">{n.resumo}</p>}
                <p className="mt-1 text-xs text-muted">{n.itens.length} {n.itens.length === 1 ? "novidade" : "novidades"}</p>
              </summary>
              <div className="mt-4 space-y-6 border-t border-border pt-4">
                {n.itens.map((it, k) => (
                  <ItemDaNovidade key={k} item={it} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
