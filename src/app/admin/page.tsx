import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { listClients } from "@/lib/data/clients";
import { listActivities } from "@/lib/data/activities";
import { listProcesses } from "@/lib/data/processes";
import { listFinancialRecords } from "@/lib/data/financial";
import { getProfile } from "@/lib/dal";
import { formatCurrency } from "@/lib/mock-data";

export default async function AdminOverviewPage() {
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";

  const [clients, activities, processes, financeiro] = await Promise.all([
    listClients(),
    listActivities(),
    listProcesses(),
    isAdmin ? listFinancialRecords() : Promise.resolve(null),
  ]);

  const clientesAtivos = clients.filter((c) => c.active);
  const inadimplentes = financeiro?.filter((f) => f.status === "overdue") ?? [];
  const atividadesAbertas = activities.filter((a) => a.status !== "concluida");

  const mesReferencia = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-navy">Visão geral</h1>
        <p className="text-sm text-foreground/50 capitalize">Panorama consolidado de todos os clientes — {mesReferencia}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clientes ativos" value={String(clientesAtivos.length)} />
        <StatCard label="Atividades em aberto" value={String(atividadesAbertas.length)} />
        <StatCard label="Processos cadastrados" value={String(processes.length)} />
        {isAdmin && (
          <StatCard
            label="Inadimplência"
            value={formatCurrency(inadimplentes.reduce((sum, f) => sum + Number(f.amount), 0))}
            hint={`${inadimplentes.length} cobrança(s) em atraso`}
            tone="danger"
          />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {isAdmin && (
          <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-navy">Alertas de inadimplência</h2>
              <Link href="/admin/financial" className="text-xs font-medium text-navy hover:underline">
                Ver financeiro
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {inadimplentes.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhuma cobrança em atraso.</p>}
              {inadimplentes.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm text-foreground">{f.clients?.name}</p>
                    <p className="text-xs text-foreground/50">
                      {f.description} · venceu em {new Date(f.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums text-status-danger">
                    {formatCurrency(Number(f.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy">Atividades em aberto</h2>
            <Link href="/admin/activities" className="text-xs font-medium text-navy hover:underline">
              Ver todas
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {atividadesAbertas.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhuma atividade em aberto.</p>}
            {atividadesAbertas.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{a.title}</p>
                  <p className="text-xs text-foreground/50">{a.clients?.name} · {a.profiles?.full_name}</p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-navy">Processos</h2>
          <Link href="/admin/processes" className="text-xs font-medium text-navy hover:underline">
            Ver todos
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {processes.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum processo cadastrado.</p>}
          {processes.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm text-foreground">{p.numero_processo}</p>
                <p className="text-xs text-foreground/50">{p.clients?.name} · {p.vara_tribunal ?? "—"}</p>
              </div>
              <span className="text-xs text-foreground/50">{p.fase ?? "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
