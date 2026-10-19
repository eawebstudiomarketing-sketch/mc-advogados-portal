import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { atividadesDoPortal } from "@/lib/data/portal-cliente";
import { LinhaAtividade } from "@/components/cliente/linha-atividade";

const GRUPOS = [
  { status: "em_andamento", titulo: "Em andamento" },
  { status: "aberta", titulo: "Na fila" },
  { status: "concluida", titulo: "Concluídas" },
] as const;

// Todas as atividades do cliente (as do escritório e os pedidos dele), por situação.
export default async function ClientActivitiesPage() {
  const profile = await requireRole(["client"]);
  const atividades = await atividadesDoPortal(profile);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Atividades · {atividades.length}</p>
          <h1 className="page-title mt-2 !text-[2.2rem] !leading-[1.05]">
            Tudo o que fazemos
            <br />
            <span className="text-foreground/30">por você.</span>
          </h1>
        </div>
        <Link href="/dashboard/pedidos/novo" className="ui-btn">
          <Plus className="h-4 w-4" aria-hidden /> Fazer um pedido
        </Link>
      </div>

      {atividades.length === 0 ? (
        <p className="border-y border-border py-6 text-sm text-muted">Nenhuma atividade ainda.</p>
      ) : (
        <div className="space-y-10">
          {GRUPOS.map((g) => {
            const itens = atividades.filter((a) => a.status === g.status);
            if (!itens.length) return null;
            const lista = g.status === "concluida" ? itens.sort((x, y) => (y.concluida_em ?? y.updated_at).localeCompare(x.concluida_em ?? x.updated_at)).slice(0, 30) : itens;
            return (
              <section key={g.status}>
                <p className="eyebrow">
                  {g.titulo} · {itens.length}
                </p>
                <ol className="mt-3 border-b border-border">
                  {lista.map((a, i) => (
                    <LinhaAtividade key={a.id} a={a} n={i + 1} />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
