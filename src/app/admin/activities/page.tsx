import Link from "next/link";
import { Plus, Archive, ArrowLeft } from "lucide-react";
import { listActivities } from "@/lib/data/activities";
import { ActivitiesView } from "./activities-view";
import { exigirPermissao } from "@/lib/dal";

export default async function AdminActivitiesPage({ searchParams }: { searchParams: Promise<{ arquivadas?: string }> }) {
  const { permissoes } = await exigirPermissao("atividades");
  const arquivadas = (await searchParams).arquivadas === "1";
  const activities = await listActivities({ arquivadas });

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{arquivadas ? "Atividades arquivadas" : "Atividades"}</h1>
          <p className="text-sm text-muted">
            {activities.length} {arquivadas ? (activities.length === 1 ? "arquivada" : "arquivadas") : activities.length === 1 ? "atividade ativa" : "atividades ativas"}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Link href={arquivadas ? "/admin/activities" : "/admin/activities?arquivadas=1"} className="ui-btn-secondary">
          {arquivadas ? <ArrowLeft className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
          {arquivadas ? "Voltar às ativas" : "Arquivadas"}
        </Link>
        <Link
          href="/admin/activities/new"
          className="ui-btn"
        >
          <Plus className="h-4 w-4" aria-hidden /> Nova atividade
        </Link>
        </div>
      </div>

      <ActivitiesView activities={activities} arquivadas={arquivadas} podeExcluir={permissoes.excluir} />
    </div>
  );
}
