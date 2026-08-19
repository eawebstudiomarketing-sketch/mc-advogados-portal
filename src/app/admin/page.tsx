import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  mockClients,
  mockAtividades,
  mockProcessos,
  mockFinanceiro,
  formatCurrency,
  formatDate,
} from "@/lib/mock-data";

export default function AdminOverviewPage() {
  const clientesAtivos = mockClients.filter((c) => c.ativo);
  const inadimplentes = mockFinanceiro.filter((f) => f.status === "atrasado");
  const atividadesAbertas = mockAtividades.filter((a) => a.status !== "concluida");
  const processosAndamento = mockProcessos.filter((p) => p.status !== "Concluído");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-navy">Visão geral</h1>
        <p className="text-sm text-foreground/50">Panorama consolidado de todos os clientes — agosto de 2026</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clientes ativos" value={String(clientesAtivos.length)} />
        <StatCard label="Atividades em aberto" value={String(atividadesAbertas.length)} />
        <StatCard label="Processos em andamento" value={String(processosAndamento.length)} />
        <StatCard
          label="Inadimplência"
          value={formatCurrency(inadimplentes.reduce((sum, f) => sum + f.amount, 0))}
          hint={`${inadimplentes.length} cobrança(s) em atraso`}
          tone="danger"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy">Alertas de inadimplência</h2>
            <Link href="/admin/financial" className="text-xs font-medium text-navy hover:underline">
              Ver financeiro
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {inadimplentes.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{f.clientName}</p>
                  <p className="text-xs text-foreground/50">{f.description} · venceu em {formatDate(f.dueDate)}</p>
                </div>
                <span className="text-sm font-medium tabular-nums text-status-danger">
                  {formatCurrency(f.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy">Atividades em aberto</h2>
            <Link href="/admin/activities" className="text-xs font-medium text-navy hover:underline">
              Ver todas
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {atividadesAbertas.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{a.title}</p>
                  <p className="text-xs text-foreground/50">{a.clientName} · {a.responsible}</p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-navy">Processos em andamento</h2>
          <Link href="/admin/processes" className="text-xs font-medium text-navy hover:underline">
            Ver todos
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {processosAndamento.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm text-foreground">{p.numero}</p>
                <p className="text-xs text-foreground/50">{p.clientName} · {p.varaTribunal}</p>
              </div>
              <span className="text-xs text-foreground/50">{p.fase}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
