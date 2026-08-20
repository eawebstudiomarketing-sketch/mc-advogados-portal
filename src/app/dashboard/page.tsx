import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "@/components/ui/bar-chart";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireRole } from "@/lib/dal";
import { listActivities } from "@/lib/data/activities";
import { listProcesses } from "@/lib/data/processes";
import { listDocuments } from "@/lib/data/documents";
import { listFinancialRecords } from "@/lib/data/financial";
import { listTimeEntries } from "@/lib/data/time-entries";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { formatCurrency } from "@/lib/mock-data";

function monthLabel(d: Date) {
  const s = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function DashboardPage() {
  const profile = await requireRole(["client"]);
  const clientId = profile.client_id!;

  const [atividades, processos, documentos, financeiro, timeEntries] = await Promise.all([
    listActivities({ clientId }),
    listProcesses({ clientId }),
    listDocuments({ clientId }),
    listFinancialRecords({ clientId }),
    listTimeEntries({ clientId }),
  ]);

  const now = new Date();
  const horasMes = timeEntries
    .filter((t) => {
      const d = new Date(t.date + "T00:00:00");
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, t) => s + Number(t.hours), 0);

  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: monthLabel(d) };
  });
  const horasPorMes = last6Months.map(({ year, month, label }) => ({
    label,
    value: timeEntries
      .filter((t) => {
        const d = new Date(t.date + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .reduce((s, t) => s + Number(t.hours), 0),
  }));

  const proximoVencimento = financeiro.find((f) => f.status !== "paid");
  const mesReferencia = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy capitalize">{mesReferencia}</h1>
          <p className="text-sm text-foreground/50">Resumo do mês</p>
        </div>
        <button className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-navy hover:bg-navy hover:text-navy-foreground">
          Baixar relatório do mês
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Horas no mês" value={`${horasMes}h`} />
        <StatCard label="Atividades abertas" value={String(atividades.filter((a) => a.status !== "concluida").length)} />
        <StatCard label="Processos em andamento" value={String(processos.length)} />
        <StatCard
          label="Situação financeira"
          value={proximoVencimento ? formatCurrency(Number(proximoVencimento.amount)) : "Em dia"}
          hint={
            proximoVencimento
              ? `Vence em ${new Date(proximoVencimento.due_date + "T00:00:00").toLocaleDateString("pt-BR")}`
              : "Nenhuma pendência"
          }
          tone={proximoVencimento?.status === "overdue" ? "danger" : proximoVencimento ? "pending" : "success"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-navy">Horas trabalhadas — últimos 6 meses</h2>
          <div className="mt-4">
            <BarChart data={horasPorMes} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Documentos recentes</h2>
          <ul className="mt-3 space-y-3">
            {documentos.length === 0 && <p className="text-sm text-foreground/50">Nenhum documento ainda.</p>}
            {documentos.map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-foreground">{doc.title}</p>
                  <p className="text-xs text-foreground/50">
                    {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                {doc.downloadUrl && (
                  <a href={doc.downloadUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-navy hover:underline">
                    Baixar
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Atividades recentes</h2>
          <ul className="mt-3 divide-y divide-border">
            {atividades.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhuma atividade registrada.</p>}
            {atividades.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{a.title}</p>
                  <p className="text-xs text-foreground/50">
                    {ACTIVITY_TYPE_LABEL[a.type]}
                    {a.deadline ? ` · prazo ${new Date(a.deadline + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Processos recentes</h2>
          <ul className="mt-3 divide-y divide-border">
            {processos.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum processo em andamento.</p>}
            {processos.map((p) => (
              <li key={p.id} className="py-3">
                <p className="text-sm text-foreground">{p.numero_processo}</p>
                <p className="text-xs text-foreground/50">{p.vara_tribunal ?? "—"} · {p.fase ?? "—"}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
