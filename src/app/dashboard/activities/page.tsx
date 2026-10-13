import Link from "next/link";
import { Plus, CheckCircle2, Clock3, CircleDashed, ListChecks } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { listActivities, type Activity } from "@/lib/data/activities";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { EmptyState } from "@/components/ui/empty-state";

const dataBR = (iso: string) => new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("pt-BR");

const GRUPOS = [
  { status: "em_andamento", titulo: "Em andamento", icone: Clock3, cor: "text-status-info" },
  { status: "aberta", titulo: "A fazer", icone: CircleDashed, cor: "text-status-pending" },
  { status: "concluida", titulo: "Concluídas", icone: CheckCircle2, cor: "text-status-success" },
] as const;

// Atividades do cliente em cartões (funciona bem no celular), agrupadas pela situação.
export default async function ClientActivitiesPage() {
  const profile = await requireRole(["client"]);
  const activities = (await listActivities({ clientId: profile.client_id! })).filter((a) => a.status !== "cancelada");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Atividades</h1>
          <p className="mt-1 text-sm text-muted">O que o escritório está fazendo por você.</p>
        </div>
        <Link href="/dashboard/activities/new" className="ui-btn-secondary">
          <Plus className="h-4 w-4" aria-hidden /> Nova solicitação
        </Link>
      </div>

      {activities.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={ListChecks} title="Nenhuma atividade ainda" />
        </div>
      ) : (
        <div className="space-y-6">
          {GRUPOS.map((g) => {
            const itens = activities.filter((a) => a.status === g.status);
            if (!itens.length) return null;
            return (
              <section key={g.status}>
                <h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <g.icone className={`h-4 w-4 ${g.cor}`} aria-hidden /> {g.titulo}
                  <span className="rounded-full bg-surface-2 px-2 text-xs font-medium tabular-nums text-muted ring-1 ring-border">{itens.length}</span>
                </h2>
                <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {itens.map((a: Activity) => (
                    <li key={a.id} className="ui-card p-4">
                      <p className="text-[15px] font-medium leading-snug text-foreground">{a.title}</p>
                      {a.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{a.description}</p>}
                      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        <span>{ACTIVITY_TYPE_LABEL[a.type]}</span>
                        {a.deadline && g.status !== "concluida" && <span>Prazo {dataBR(a.deadline)}</span>}
                        {g.status === "concluida" && <span>Concluída em {dataBR(a.updated_at)}</span>}
                        {a.profiles?.full_name && <span>Responsável: {a.profiles.full_name}</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
