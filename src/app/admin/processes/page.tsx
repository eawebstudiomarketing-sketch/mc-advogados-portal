import { BarraFiltros } from "@/components/ui/barra-filtros";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { listProcesses } from "@/lib/data/processes";
import { PROCESS_AREA_LABEL } from "@/lib/process-area";
import { StatusBadge } from "@/components/ui/status-badge";
import { deleteProcessAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { exigirPermissao } from "@/lib/dal";

type F = { busca?: string; cliente?: string; area?: string; status?: string };

export default async function AdminProcessesPage({ searchParams }: { searchParams: Promise<F> }) {
  await exigirPermissao("processos");
  const f = await searchParams;
  const todos = await listProcesses();
  const termo = (f.busca ?? "").trim().toLowerCase();
  const digitos = termo.replace(/\D/g, "");
  const processes = todos.filter(
    (p) =>
      (!termo ||
        p.numero_processo.toLowerCase().includes(termo) ||
        (digitos.length >= 4 && (p.numero_digitos ?? "").includes(digitos)) ||
        (p.vara_tribunal ?? "").toLowerCase().includes(termo) ||
        (p.fase ?? "").toLowerCase().includes(termo) ||
        (p.clients?.name ?? "").toLowerCase().includes(termo) ||
        (p.titulo ?? "").toLowerCase().includes(termo) ||
        (p.cliente_nome ?? "").toLowerCase().includes(termo)) &&
      (!f.cliente || (f.cliente === "sem" ? !p.client_id : p.client_id === f.cliente)) &&
      (!f.area || p.area === f.area) &&
      (!f.status || p.status === f.status)
  );
  const statuses = [...new Set(todos.map((p) => p.status))].sort();

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Processos</p>
          <h1 className="page-title">Processos</h1>
          <p className="text-sm text-muted">
            {processes.length} {processes.length === 1 ? "processo cadastrado" : "processos cadastrados"}
          </p>
        </div>
        <Link
          href="/admin/processes/new"
          className="ui-btn"
        >
          <Plus className="h-4 w-4" aria-hidden /> Novo processo
        </Link>
      </div>

      <BarraFiltros
        filtros={[
          { tipo: "busca", nome: "busca", rotulo: "Buscar por número, partes, vara ou cliente" },
          { tipo: "select", nome: "cliente", rotulo: "Cliente", todos: "Todos os clientes", opcoes: [
            ...[...new Map(todos.filter((x) => x.client_id).map((x) => [x.client_id!, x.clients?.name ?? "Cliente"])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([valor, rotulo]) => ({ valor, rotulo })),
            ...(todos.some((x) => !x.client_id) ? [{ valor: "sem", rotulo: "Sem ficha de cliente" }] : []),
          ] },
          { tipo: "select", nome: "area", rotulo: "Área", todos: "Todas as áreas", opcoes: Object.entries(PROCESS_AREA_LABEL).map(([valor, rotulo]) => ({ valor, rotulo })) },
          { tipo: "select", nome: "status", rotulo: "Situação", todos: "Todas as situações", opcoes: statuses.map((s) => ({ valor: s, rotulo: s.replace(/_/g, " ") })) },
        ]}
      />

      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-5 py-2.5 font-medium">Título</th>
              <th className="px-5 py-2.5 font-medium">Cliente / pasta</th>
              <th className="px-5 py-2.5 font-medium">Ação / foro</th>
              <th className="px-5 py-2.5 font-medium">Últ. mov.</th>
              <th className="px-5 py-2.5 font-medium">Responsável</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {processes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted">
                  Nenhum processo cadastrado ainda.
                </td>
              </tr>
            )}
            {processes.map((p) => (
              <tr key={p.id}>
                <td className="px-5 py-2.5 font-medium">
                  <Link href={`/admin/processes/${p.id}`} className="text-status-info hover:underline">
                    {p.numero_processo}
                  </Link>
                  {p.titulo && <p className="max-w-xs truncate text-xs font-normal text-muted" title={p.titulo}>{p.titulo}</p>}
                </td>
                <td className="px-5 py-3 text-foreground/70">{p.clients?.name ?? (p.cliente_nome ? <span title="Sem ficha no portal">{p.cliente_nome} <span className="text-xs text-muted">(sem ficha)</span></span> : "—")}</td>
                <td className="px-5 py-3 text-foreground/80">
                  {PROCESS_AREA_LABEL[p.area]}
                  <span className="block text-xs text-muted">{p.vara_tribunal ?? "—"}</span>
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-foreground/70">{p.ultimo_andamento_em ? new Date(p.ultimo_andamento_em).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" }) : "—"}</td>
                <td className="px-5 py-3 text-foreground/70">{p.profiles?.full_name ?? p.responsavel_nome ?? "—"}</td>
                <td className="px-5 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-0.5">
                    <Link href={`/admin/processes/${p.id}/edit`} className="icon-btn" aria-label="Editar" data-tip="Editar"><Pencil aria-hidden /></Link>
                    <ConfirmSubmitButton
                      action={deleteProcessAction}
                      hiddenFields={{ id: p.id }}
                      confirmMessage={`Excluir o processo "${p.numero_processo}"?`}
                      label="Excluir"
                      icon="trash"
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
