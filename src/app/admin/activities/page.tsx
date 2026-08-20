import Link from "next/link";
import { listActivities } from "@/lib/data/activities";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { StatusSelect } from "./status-select";
import { deleteActivityAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatDate } from "@/lib/mock-data";

export default async function AdminActivitiesPage() {
  const activities = await listActivities();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Atividades</h1>
          <p className="text-sm text-foreground/50">
            {activities.length} {activities.length === 1 ? "atividade registrada" : "atividades registradas"}
          </p>
        </div>
        <Link
          href="/admin/activities/new"
          className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90"
        >
          Nova atividade
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Atividade</th>
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Responsável</th>
              <th className="px-5 py-3 font-medium">Prazo</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activities.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-foreground/50">
                  Nenhuma atividade registrada ainda.
                </td>
              </tr>
            )}
            {activities.map((a) => (
              <tr key={a.id} className="hover:bg-background">
                <td className="px-5 py-3">
                  <p className="font-medium text-foreground">{a.title}</p>
                  <p className="text-xs text-foreground/50">{ACTIVITY_TYPE_LABEL[a.type]}</p>
                </td>
                <td className="px-5 py-3 text-foreground/70">{a.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">{a.profiles?.full_name}</td>
                <td className="px-5 py-3 text-foreground/70">{a.deadline ? formatDate(a.deadline) : "—"}</td>
                <td className="px-5 py-3">
                  <StatusSelect id={a.id} status={a.status} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/admin/activities/${a.id}/edit`} className="text-xs font-medium text-navy hover:underline">
                      Editar
                    </Link>
                    <ConfirmSubmitButton
                      action={deleteActivityAction}
                      hiddenFields={{ id: a.id }}
                      confirmMessage={`Excluir a atividade "${a.title}"?`}
                      label="Excluir"
                      className="text-xs font-medium text-status-danger hover:underline"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
