import Link from "next/link";
import { Plus, Archive, ArrowLeft, List, Columns3 } from "lucide-react";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { PipelineBoard } from "@/components/cliente/pipeline-board";
import { pipelineDosClientes, ETAPAS } from "@/lib/data/pipeline";
import { StatusBadge } from "@/components/ui/status-badge";
import { listClients } from "@/lib/data/clients";
import { exigirPermissao } from "@/lib/dal";

const COR_ETAPA: Record<string, string> = {
  ficha_incompleta: "bg-status-danger",
  ficha_completa: "bg-status-pending",
  onboarding_gerado: "bg-gold",
  onboarding_respondido: "bg-status-info",
  demandas_geradas: "bg-[#7c5cc4]",
  em_execucao: "bg-status-success",
};

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ arquivados?: string; ver?: string; busca?: string; tipo?: string; status?: string; etapa?: string }>;
}) {
  await exigirPermissao("clientes");
  const sp = await searchParams;
  const arquivados = sp.arquivados === "1";
  const verPipeline = sp.ver === "pipeline" && !arquivados;
  const [todos, pipeline] = await Promise.all([listClients({ arquivados }), arquivados ? Promise.resolve([]) : pipelineDosClientes()]);
  const etapaDe = new Map(pipeline.map((c) => [c.id, c.etapa]));
  const termo = (sp.busca ?? "").trim().toLowerCase();
  const clients = todos.filter(
    (c) =>
      (!termo || c.name.toLowerCase().includes(termo) || (c.documento ?? "").toLowerCase().includes(termo) || (c.email_contact ?? "").toLowerCase().includes(termo)) &&
      (!sp.tipo || c.tipo_pessoa === sp.tipo) &&
      (!sp.status || (sp.status === "ativo" ? c.active : !c.active)) &&
      (!sp.etapa || etapaDe.get(c.id) === sp.etapa)
  );
  const ids = new Set(clients.map((c) => c.id));
  const alternar = (ver: "lista" | "pipeline") => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "ver") as [string, string][]);
    if (ver === "pipeline") q.set("ver", "pipeline");
    return `/admin/clients${q.size ? `?${q}` : ""}`;
  };

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Dia a dia · Carteira</p>
          <h1 className="page-title">{arquivados ? "Clientes arquivados" : "Clientes"}</h1>
          <p className="text-sm text-muted">
            {clients.length} {clients.length === 1 ? "cliente" : "clientes"}
            {clients.length !== todos.length ? ` de ${todos.length}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {!arquivados && (
          <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-1" role="tablist" aria-label="Como ver">
            {([
              ["lista", "Lista", List],
              ["pipeline", "Pipeline", Columns3],
            ] as const).map(([id, rotulo, Icone]) => {
              const on = (id === "pipeline") === verPipeline;
              return (
                <Link
                  key={id}
                  href={alternar(id)}
                  role="tab"
                  aria-selected={on}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${on ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}
                >
                  <Icone className="h-3.5 w-3.5" aria-hidden /> {rotulo}
                </Link>
              );
            })}
          </div>
        )}
        <Link href={arquivados ? "/admin/clients" : "/admin/clients?arquivados=1"} className="ui-btn-secondary">
          {arquivados ? <ArrowLeft className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
          {arquivados ? "Voltar aos ativos" : "Arquivados"}
        </Link>
        <Link href="/admin/clients/new" className="ui-btn">
          <Plus className="h-4 w-4" aria-hidden /> Novo cliente
        </Link>
        </div>
      </div>

      <BarraFiltros
        filtros={[
          { tipo: "busca", nome: "busca", rotulo: "Buscar por nome, CPF/CNPJ ou e-mail" },
          { tipo: "select", nome: "tipo", rotulo: "Tipo", todos: "PF e PJ", opcoes: [{ valor: "PJ", rotulo: "Pessoa jurídica" }, { valor: "PF", rotulo: "Pessoa física" }] },
          { tipo: "select", nome: "status", rotulo: "Situação", todos: "Ativos e inativos", opcoes: [{ valor: "ativo", rotulo: "Ativos" }, { valor: "inativo", rotulo: "Inativos" }] },
          ...(arquivados ? [] : [{ tipo: "select" as const, nome: "etapa", rotulo: "Etapa", todos: "Todas as etapas", opcoes: ETAPAS.map((e) => ({ valor: e.id, rotulo: e.rotulo })) }]),
        ]}
      />

      {verPipeline ? (
        <PipelineBoard cartoes={pipeline.filter((c) => ids.has(c.id))} />
      ) : (
      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="w-12 pl-5">Nº</th>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Tipo</th>
              <th className="px-5 py-2.5 font-medium">Etapa</th>
              <th className="px-5 py-2.5 font-medium">Cadastrado em</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted">
                  {todos.length && !clients.length ? "Nenhum cliente com esses filtros." : arquivados ? "Nenhum cliente arquivado." : "Nenhum cliente cadastrado ainda."}
                </td>
              </tr>
            )}
            {clients.map((c, i) => (
              <tr key={c.id}>
                <td className="pl-5">
                  <span className="eyebrow !text-[11px] tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                </td>
                <td className="px-5 py-3">
                  <Link href={`/admin/clients/${c.id}`} className="group flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-gold-2">
                      {c.name.replace(/[^A-Za-zÀ-ú0-9 ]/g, "").trim().slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground underline-offset-2 group-hover:underline">{c.name}</span>
                      <span className="block text-xs text-muted">{c.documento}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-5 py-3 text-foreground/70">{c.tipo_pessoa}</td>
                <td className="px-5 py-3 text-xs whitespace-nowrap text-foreground/75">
                  {etapaDe.get(c.id) ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${COR_ETAPA[etapaDe.get(c.id)!]}`} aria-hidden />
                      {ETAPAS.find((e) => e.id === etapaDe.get(c.id))?.rotulo}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-5 py-3 text-foreground/70">
                  {new Date(c.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={c.active ? "ativo" : "inativo"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
