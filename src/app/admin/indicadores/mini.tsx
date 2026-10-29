import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { miniIndicadores } from "@/lib/painel/individual";

// Mini visão dos Indicadores na Visão geral: só os números do próprio usuário
// (nunca de outra pessoa), calculados sem varrer o WhatsApp para abrir rápido.
export async function MiniIndicadores({ profileId, nome }: { profileId: string; nome: string }) {
  const m = await miniIndicadores(profileId, nome).catch(() => null);
  if (!m) return null;
  const itens: { rotulo: string; valor: string; tom?: "danger" | "pending" }[] = [
    { rotulo: "Entregues no mês", valor: String(m.entregues) },
    { rotulo: "No prazo", valor: m.noPrazoPct === null ? "—" : `${m.noPrazoPct}%` },
    { rotulo: "Abertas", valor: String(m.abertas) },
    { rotulo: "Atrasadas", valor: String(m.atrasadas), tom: m.atrasadas > 0 ? "danger" : undefined },
    { rotulo: "Publicações pendentes", valor: String(m.publicacoesPendentes), tom: m.publicacoesPendentes > 0 ? "pending" : undefined },
    { rotulo: "Andamentos novos", valor: String(m.andamentosNovos), tom: m.andamentosNovos > 0 ? "pending" : undefined },
  ];
  return (
    <section className="mb-10 ui-card p-5" aria-label="Meus indicadores">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Meus indicadores · este mês</p>
          <p className="text-xs text-muted">Só você vê estes números.</p>
        </div>
        <Link href="/admin/indicadores" className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline">
          Ver completo <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
        {itens.map((x) => (
          <div key={x.rotulo}>
            <dt className="text-xs text-muted">{x.rotulo}</dt>
            <dd className="numero-grande text-2xl leading-tight" style={x.tom ? { color: x.tom === "danger" ? "var(--status-danger)" : "var(--status-pending)" } : undefined}>
              {x.valor}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
