import Link from "next/link";
import { listActivities } from "@/lib/data/activities";
import { ActivitiesView } from "./activities-view";

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

      <ActivitiesView activities={activities} />
    </div>
  );
}
