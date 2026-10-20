import Link from "next/link";
import { Plus, Archive, ArrowLeft, Tag } from "lucide-react";
import { listActivities } from "@/lib/data/activities";
import { ActivitiesView } from "./activities-view";
import { exigirPermissao } from "@/lib/dal";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { listPessoas, getEscritorioConfig } from "@/lib/data/escritorio";
import { grupoDoPrazo, hojeBahia } from "@/lib/data/painel";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { ACTIVITY_STATUS_LABEL } from "@/lib/activity-status";
import { listEtiquetas } from "@/lib/data/etiquetas";

const COR_STATUS: Record<string, string> = {
  aberta: "bg-status-pending",
  em_andamento: "bg-status-info",
  concluida: "bg-status-success",
  cancelada: "bg-border-strong",
};

type Filtros = { etiqueta?: string; arquivadas?: string; busca?: string; status?: string; cliente?: string; responsavel?: string; tipo?: string; area?: string; prazo?: string; categoria?: string };

export default async function AdminActivitiesPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  const { permissoes } = await exigirPermissao("atividades");
  const f = await searchParams;
  const arquivadas = f.arquivadas === "1";
  const [todas, pessoas, config, etiquetas] = await Promise.all([listActivities({ arquivadas }), listPessoas(), getEscritorioConfig(), listEtiquetas()]);
  const hoje = hojeBahia();
  const termo = (f.busca ?? "").trim().toLowerCase();
  const activities = todas.filter(
    (a) =>
      (!termo || a.title.toLowerCase().includes(termo) || (a.description ?? "").toLowerCase().includes(termo) || (a.clients?.name ?? "").toLowerCase().includes(termo)) &&
      (!f.status || a.status === f.status) &&
      (!f.etiqueta || (a.etiquetas ?? []).includes(f.etiqueta)) &&
      (!f.cliente || a.client_id === f.cliente) &&
      (!f.responsavel || (f.responsavel === "nenhum" ? !a.responsavel_id : a.responsavel_id === f.responsavel || (a.envolvidos ?? []).includes(f.responsavel))) &&
      (!f.tipo || a.type === f.tipo) &&
      (!f.area || a.area === f.area) &&
      (!f.categoria || a.categoria === f.categoria) &&
      (!f.prazo || grupoDoPrazo(a.deadline, hoje) === f.prazo)
  );
  const clientes = [...new Map(todas.filter((a) => a.client_id).map((a) => [a.client_id, a.clients?.name ?? "Cliente"])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Operacional · Atividades</p>
          <h1 className="page-title">{arquivadas ? "Atividades arquivadas" : "Atividades"}</h1>
          <p className="text-sm text-muted">
            {activities.length !== todas.length ? `${activities.length} de ${todas.length} · ` : ""}
            {todas.length} {arquivadas ? (todas.length === 1 ? "arquivada" : "arquivadas") : todas.length === 1 ? "atividade ativa" : "atividades ativas"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/activities/etiquetas" className="ui-btn-secondary">
          <Tag className="h-4 w-4" aria-hidden /> Etiquetas
        </Link>
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

      <BarraFiltros
        filtros={[
          { tipo: "busca", nome: "busca", rotulo: "Buscar atividade, descrição ou cliente" },
          { tipo: "select", nome: "status", rotulo: "Status", todos: "Todos os status", opcoes: Object.entries(ACTIVITY_STATUS_LABEL).map(([v, r]) => ({ valor: v, rotulo: r, cor: COR_STATUS[v] })) },
          {
            tipo: "select",
            nome: "prazo",
            rotulo: "Prazo",
            todos: "Qualquer prazo",
            opcoes: [
              { valor: "atrasadas", rotulo: "Atrasadas", cor: "bg-status-danger" },
              { valor: "hoje", rotulo: "Vencem hoje", cor: "bg-status-pending" },
              { valor: "semana", rotulo: "Próximos 7 dias", cor: "bg-status-info" },
              { valor: "depois", rotulo: "Mais adiante", cor: "bg-status-success" },
              { valor: "sem_prazo", rotulo: "Sem prazo", cor: "bg-border-strong" },
            ],
          },
          {
            tipo: "select",
            nome: "responsavel",
            rotulo: "Responsável",
            todos: "Todos os responsáveis",
            opcoes: [...pessoas.map((p) => ({ valor: p.id, rotulo: p.nome })), { valor: "nenhum", rotulo: "Sem responsável" }],
          },
          { tipo: "select", nome: "cliente", rotulo: "Cliente", todos: "Todos os clientes", opcoes: clientes.map(([v, r]) => ({ valor: v, rotulo: r })) },
          { tipo: "select", nome: "tipo", rotulo: "Tipo", todos: "Todos os tipos", opcoes: Object.entries(ACTIVITY_TYPE_LABEL).map(([v, r]) => ({ valor: v, rotulo: r })) },
          {
            tipo: "select",
            nome: "categoria",
            rotulo: "Categoria",
            todos: "Tarefa, prazo e audiência",
            opcoes: [
              { valor: "tarefa", rotulo: "Tarefa" },
              { valor: "prazo", rotulo: "Prazo processual" },
              { valor: "audiencia", rotulo: "Audiência" },
            ],
          },
          { tipo: "select", nome: "area", rotulo: "Área", todos: "Todas as áreas", opcoes: config.areas.map((a) => ({ valor: a, rotulo: a })) },
          { tipo: "select", nome: "etiqueta", rotulo: "Etiqueta", todos: "Todas as etiquetas", opcoes: etiquetas.map((e) => ({ valor: e.id, rotulo: e.nome })) },
        ]}
      />

      <ActivitiesView etiquetas={etiquetas} activities={activities} arquivadas={arquivadas} podeExcluir={permissoes.excluir} />
    </div>
  );
}
