import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import {
  mockClients,
  mockAtividades,
  mockProcessos,
  mockDocumentos,
  mockContratos,
  mockFinanceiro,
  formatCurrency,
  formatDate,
} from "@/lib/mock-data";

export default async function AdminClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = mockClients.find((c) => c.id === id);
  if (!client) notFound();

  const atividades = mockAtividades.filter((a) => a.clientId === id);
  const processos = mockProcessos.filter((p) => p.clientId === id);
  const documentos = mockDocumentos.filter((d) => d.clientId === id);
  const contratos = mockContratos.filter((c) => c.clientId === id);
  const financeiro = mockFinanceiro.filter((f) => f.clientId === id);

  return (
    <div>
      <Link href="/admin/clients" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para clientes
      </Link>

      <div className="mt-3 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">{client.name}</h1>
          <p className="text-sm text-foreground/50">{client.tipoPessoa} · {client.documento} · {client.email}</p>
        </div>
        <StatusBadge status={client.ativo ? "ativo" : "inativo"} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Horas no mês" value={`${client.horasMes}h`} />
        <StatCard label="Atividades abertas" value={String(atividades.filter((a) => a.status !== "concluida").length)} />
        <StatCard
          label="Situação financeira"
          value={client.statusFinanceiro === "pago" ? "Em dia" : "Pendência"}
          tone={client.statusFinanceiro === "atrasado" ? "danger" : client.statusFinanceiro === "pendente" ? "pending" : "success"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Atividades</h2>
          <ul className="mt-3 divide-y divide-border">
            {atividades.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhuma atividade registrada.</p>}
            {atividades.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{a.title}</p>
                  <p className="text-xs text-foreground/50">{a.responsible} · prazo {formatDate(a.deadline)}</p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Processos</h2>
          <ul className="mt-3 divide-y divide-border">
            {processos.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum processo em andamento.</p>}
            {processos.map((p) => (
              <li key={p.id} className="py-3">
                <p className="text-sm text-foreground">{p.numero}</p>
                <p className="text-xs text-foreground/50">{p.varaTribunal} · {p.fase}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Documentos</h2>
          <ul className="mt-3 divide-y divide-border">
            {documentos.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum documento anexado.</p>}
            {documentos.map((d) => (
              <li key={d.id} className="py-3">
                <p className="text-sm text-foreground">{d.title}</p>
                <p className="text-xs text-foreground/50">{d.category} · {formatDate(d.date)}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Contratos</h2>
          <ul className="mt-3 divide-y divide-border">
            {contratos.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum contrato cadastrado.</p>}
            {contratos.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{c.title}</p>
                  <p className="text-xs text-foreground/50">Desde {formatDate(c.startDate)}</p>
                </div>
                <span className="text-sm font-medium tabular-nums text-foreground/70">{formatCurrency(c.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-navy">Financeiro</h2>
        <ul className="mt-3 divide-y divide-border">
          {financeiro.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum lançamento financeiro.</p>}
          {financeiro.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm text-foreground">{f.description}</p>
                <p className="text-xs text-foreground/50">Vencimento {formatDate(f.dueDate)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium tabular-nums text-foreground/70">{formatCurrency(f.amount)}</span>
                <StatusBadge status={f.status} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
