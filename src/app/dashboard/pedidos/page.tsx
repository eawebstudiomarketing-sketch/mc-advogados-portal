import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { atividadesDoPortal } from "@/lib/data/portal-cliente";
import { CartaoPedido } from "@/components/cliente/cartao-pedido";

// Pedidos que o próprio cliente abriu, com a etapa de cada um.
export default async function PedidosPage() {
  const profile = await requireRole(["client"]);
  const pedidos = (await atividadesDoPortal(profile)).filter((a) => a.doCliente).sort((x, y) => y.created_at.localeCompare(x.created_at));
  const abertos = pedidos.filter((p) => p.etapa !== "concluido");
  const concluidos = pedidos.filter((p) => p.etapa === "concluido");

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Pedidos</p>
          <h1 className="page-title mt-2 !text-[2.2rem] !leading-[1.05]">
            Seus pedidos,
            <br />
            <span className="text-foreground/30">do envio à conclusão.</span>
          </h1>
        </div>
        <Link href="/dashboard/pedidos/novo" className="ui-btn">
          <Plus className="h-4 w-4" aria-hidden /> Fazer um pedido
        </Link>
      </div>

      {pedidos.length === 0 ? (
        <Link
          href="/dashboard/pedidos/novo"
          className="flex flex-col items-start gap-1 rounded-2xl border border-dashed border-border-strong p-6 transition-colors hover:border-navy hover:bg-surface"
        >
          <span className="font-display text-lg font-bold text-foreground">Você ainda não fez nenhum pedido.</span>
          <span className="text-sm text-muted">Conte o que precisa: o escritório recebe na hora, define quem vai cuidar e você acompanha cada etapa aqui.</span>
          <span className="eyebrow mt-3 !text-navy">Fazer o primeiro pedido ›</span>
        </Link>
      ) : (
        <div className="space-y-10">
          <section>
            <p className="eyebrow mb-3">Em aberto · {abertos.length}</p>
            {abertos.length === 0 ? (
              <p className="border-y border-border py-5 text-sm text-muted">Nenhum pedido em aberto.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {abertos.map((p) => (
                  <CartaoPedido key={p.id} p={p} />
                ))}
              </ul>
            )}
          </section>
          {concluidos.length > 0 && (
            <section>
              <p className="eyebrow mb-3">Concluídos · {concluidos.length}</p>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {concluidos.slice(0, 20).map((p) => (
                  <CartaoPedido key={p.id} p={p} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
