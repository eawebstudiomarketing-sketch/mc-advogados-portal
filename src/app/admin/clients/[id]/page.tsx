import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { getClient } from "@/lib/data/clients";
import { listActivities } from "@/lib/data/activities";
import { listProcesses } from "@/lib/data/processes";
import { listDocuments } from "@/lib/data/documents";
import { listContracts } from "@/lib/data/contracts";
import { listFinancialRecords } from "@/lib/data/financial";
import { listTimeEntries } from "@/lib/data/time-entries";
import { listOnboardings } from "@/lib/data/onboardings";
import { getClientPortalUser } from "@/lib/data/team";
import { removeClientPortalUserAction } from "@/app/admin/team/actions";
import { requireRole } from "@/lib/dal";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { formatCurrency } from "@/lib/mock-data";
import { PortalAccessInvite } from "./portal-access";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

export default async function AdminClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  await requireRole(["admin"]);
  const isAdmin = true;

  const [client, activities, processes, documents, contracts, timeEntries, financial, portalUser, onboardings] = await Promise.all([
    getClient(id),
    listActivities({ clientId: id }),
    listProcesses({ clientId: id }),
    listDocuments({ clientId: id }),
    listContracts({ clientId: id }),
    listTimeEntries({ clientId: id }),
    isAdmin ? listFinancialRecords({ clientId: id }) : Promise.resolve(null),
    isAdmin ? getClientPortalUser(id) : Promise.resolve(null),
    isAdmin ? listOnboardings({ clientId: id }) : Promise.resolve(null),
  ]);
  if (!client) notFound();

  const now = new Date();
  const horasMes = timeEntries
    .filter((t) => {
      const d = new Date(t.date + "T00:00:00");
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((s, t) => s + Number(t.hours), 0);

  const proximoVencimento = financial?.find((f) => f.status !== "paid") ?? null;

  return (
    <div>
      <Link href="/admin/clients" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para clientes
      </Link>

      <div className="mt-3 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">{client.name}</h1>
          <p className="text-sm text-foreground/50">
            {client.tipo_pessoa} · {client.documento} · {client.email_contact}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={client.active ? "ativo" : "inativo"} />
          {isAdmin && (
            <Link
              href={`/admin/clients/${client.id}/edit`}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy hover:text-navy-foreground"
            >
              Editar
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Horas no mês" value={`${horasMes}h`} />
        <StatCard label="Atividades abertas" value={String(activities.filter((a) => a.status !== "concluida").length)} />
        {isAdmin && (
          <StatCard
            label="Situação financeira"
            value={proximoVencimento ? formatCurrency(Number(proximoVencimento.amount)) : "Em dia"}
            tone={proximoVencimento?.status === "overdue" ? "danger" : proximoVencimento ? "pending" : "success"}
          />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Atividades</h2>
          <ul className="mt-3 divide-y divide-border">
            {activities.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhuma atividade registrada.</p>}
            {activities.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{a.title}</p>
                  <p className="text-xs text-foreground/50">
                    {ACTIVITY_TYPE_LABEL[a.type]} · {a.profiles?.full_name}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Processos</h2>
          <ul className="mt-3 divide-y divide-border">
            {processes.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum processo em andamento.</p>}
            {processes.map((p) => (
              <li key={p.id} className="py-3">
                <p className="text-sm text-foreground">{p.numero_processo}</p>
                <p className="text-xs text-foreground/50">{p.vara_tribunal ?? "—"} · {p.fase ?? "—"}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Documentos</h2>
          <ul className="mt-3 divide-y divide-border">
            {documents.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum documento anexado.</p>}
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{d.title}</p>
                  <p className="text-xs text-foreground/50">
                    {new Date(d.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                {d.downloadUrl && (
                  <a href={d.downloadUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-navy hover:underline">
                    Baixar
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Contratos</h2>
          <ul className="mt-3 divide-y divide-border">
            {contracts.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum contrato cadastrado.</p>}
            {contracts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{c.title}</p>
                  <p className="text-xs text-foreground/50">
                    Desde {new Date(c.start_date + "T00:00:00").toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums text-foreground/70">
                  {c.value ? formatCurrency(Number(c.value)) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {isAdmin && financial && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Financeiro</h2>
          <ul className="mt-3 divide-y divide-border">
            {financial.length === 0 && <p className="py-3 text-sm text-foreground/50">Nenhum lançamento financeiro.</p>}
            {financial.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">{f.description}</p>
                  <p className="text-xs text-foreground/50">
                    Vencimento {new Date(f.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums text-foreground/70">
                    {formatCurrency(Number(f.amount))}
                  </span>
                  <StatusBadge status={f.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isAdmin && onboardings && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy">Onboarding</h2>
            <Link
              href={`/admin/onboarding/new?clientId=${client.id}`}
              className="text-xs font-medium text-navy hover:underline"
            >
              + Novo onboarding
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {onboardings.length === 0 && <p className="py-3 text-sm text-foreground/50">Onboarding ainda não feito.</p>}
            {onboardings.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-foreground">
                    Feito em {new Date(o.created_at).toLocaleDateString("pt-BR")}
                  </p>
                  <p className="text-xs text-foreground/50">{o.profiles?.full_name ?? "—"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/admin/onboarding/${o.id}`} className="text-xs font-medium text-navy hover:underline">
                    Ver
                  </Link>
                  {o.downloadUrl && (
                    <a href={o.downloadUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-navy hover:underline">
                      Baixar PDF
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isAdmin && (
        <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Acesso ao portal</h2>
          {portalUser ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-sm text-foreground/70">
                {portalUser.full_name} ({portalUser.email}) já tem acesso ao portal do cliente.
              </p>
              <ConfirmSubmitButton
                action={removeClientPortalUserAction}
                hiddenFields={{ user_id: portalUser.user_id, client_id: client.id }}
                confirmMessage={`Remover o acesso de ${portalUser.full_name} ao portal?`}
                label="Remover acesso"
                className="shrink-0 text-xs font-medium text-status-danger hover:underline"
              />
            </div>
          ) : (
            <>
              <p className="mt-3 text-sm text-foreground/50">
                Este cliente ainda não tem acesso ao portal. Convide o contato principal:
              </p>
              <PortalAccessInvite clientId={client.id} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
