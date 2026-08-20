import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "@/components/ui/bar-chart";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  currentClient,
  mockAtividades,
  mockProcessos,
  mockDocumentos,
  mockFinanceiro,
  mockHorasPorMes,
  formatCurrency,
  formatDate,
} from "@/lib/mock-data";

export default function DashboardPage() {
  const atividades = mockAtividades.filter((a) => a.clientId === currentClient.id);
  const processos = mockProcessos.filter((p) => p.clientId === currentClient.id);
  const documentos = mockDocumentos.filter((d) => d.clientId === currentClient.id);
  const financeiro = mockFinanceiro.filter((f) => f.clientId === currentClient.id);
  const proximoVencimento = financeiro.find((f) => f.status !== "pago");

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Agosto de 2026</h1>
          <p className="text-sm text-foreground/50">Resumo do mês para {currentClient.name}</p>
        </div>
        <button className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-navy hover:bg-navy hover:text-navy-foreground">
          Baixar relatório do mês
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Horas no mês" value="14,5h" hint="+4,5h vs. julho" />
        <StatCard label="Atividades abertas" value={String(atividades.filter((a) => a.status !== "concluida").length)} />
        <StatCard label="Processos em andamento" value={String(processos.length)} />
        <StatCard
          label="Situação financeira"
          value={proximoVencimento ? formatCurrency(proximoVencimento.amount) : "Em dia"}
          hint={proximoVencimento ? `Vence em ${formatDate(proximoVencimento.dueDate)}` : "Nenhuma pendência"}
          tone={proximoVencimento?.status === "atrasado" ? "danger" : proximoVencimento ? "pending" : "success"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-navy">Horas trabalhadas — últimos 6 meses</h2>
          <div className="mt-4">
            <BarChart data={mockHorasPorMes.map((h) => ({ label: h.mes, value: h.horas }))} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Documentos recentes</h2>
          <ul className="mt-3 space-y-3">
            {documentos.map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-foreground">{doc.title}</p>
                  <p className="text-xs text-foreground/50">{doc.category} · {formatDate(doc.date)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Atividades recentes</h2>
          <ul className="mt-3 divide-y divide-border">
            {atividades.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{a.title}</p>
                  <p className="text-xs text-foreground/50">{a.type} · prazo {formatDate(a.deadline)}</p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Processos recentes</h2>
          <ul className="mt-3 divide-y divide-border">
            {processos.map((p) => (
              <li key={p.id} className="py-3">
                <p className="text-sm text-foreground">{p.numero}</p>
                <p className="text-xs text-foreground/50">{p.varaTribunal} · {p.fase}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
