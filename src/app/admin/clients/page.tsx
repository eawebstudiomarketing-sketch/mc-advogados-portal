import Link from "next/link";
import { formatarDocumento, formatarTelefone } from "@/lib/formatar";
import { Plus, Archive, ArrowLeft, List, Columns3, Users } from "lucide-react";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { PipelineBoard } from "@/components/cliente/pipeline-board";
import { pipelineDosClientes, ETAPAS } from "@/lib/data/pipeline";
import { StatusBadge } from "@/components/ui/status-badge";
import { listClients } from "@/lib/data/clients";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { hojeBahia } from "@/lib/data/painel";
import { ordenar, dataPlanilha } from "@/lib/ordenar";
import { ListaVazia } from "@/components/ui/empty-state";

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
  searchParams: Promise<{ arquivados?: string; ver?: string; busca?: string; tipo?: string; status?: string; etapa?: string; aba?: string; ordem?: string }>;
}) {
  const { permissoes } = await exigirPermissao("clientes");
  const sp = await searchParams;
  // duas abas: Empresas (PJ) e Pessoas (PF, com permissão própria)
  const podePF = !!permissoes.clientes_pf;
  const tipo: "PJ" | "PF" = sp.aba === "pf" && podePF ? "PF" : "PJ";
  const arquivados = sp.arquivados === "1";
  const verPipeline = sp.ver === "pipeline" && !arquivados && tipo === "PJ";
  const [daCarteira, pipeline] = await Promise.all([listClients({ arquivados }), arquivados || tipo === "PF" ? Promise.resolve([]) : pipelineDosClientes()]);
  const qtd = { PJ: daCarteira.filter((c) => c.tipo_pessoa === "PJ").length, PF: daCarteira.filter((c) => c.tipo_pessoa === "PF").length };
  const todos = daCarteira.filter((c) => c.tipo_pessoa === tipo);
  const processosPorCliente = new Map<string, number>();
  if (tipo === "PF" && todos.length) {
    const { data } = await (await createClient()).from("processes").select("client_id").in("client_id", todos.map((c) => c.id));
    for (const p of data ?? []) processosPorCliente.set(p.client_id!, (processosPorCliente.get(p.client_id!) ?? 0) + 1);
  }
  const etapaDe = new Map(pipeline.map((c) => [c.id, c.etapa]));
  // demandas em aberto por cliente: a lista abre com quem tem mais em aberto no topo
  const abertasPorCliente = new Map<string, { n: number; atrasadas: number }>();
  {
    const hoje = hojeBahia();
    const { data } = await (await createClient()).from("activities").select("client_id, deadline").in("status", ["aberta", "em_andamento"]).is("archived_at", null).not("client_id", "is", null);
    for (const a of data ?? []) {
      const x = abertasPorCliente.get(a.client_id!) ?? { n: 0, atrasadas: 0 };
      x.n++;
      if (a.deadline && a.deadline < hoje) x.atrasadas++;
      abertasPorCliente.set(a.client_id!, x);
    }
  }
  const termo = (sp.busca ?? "").trim().toLowerCase();
  const clients = todos.filter(
    (c) =>
      (!termo ||
        c.name.toLowerCase().includes(termo) ||
        (c.apelido ?? "").toLowerCase().includes(termo) ||
        (c.documento ?? "").toLowerCase().includes(termo) ||
        (c.email_contact ?? "").toLowerCase().includes(termo) ||
        (c.telefones ?? []).some((t) => t.replace(/\D/g, "").includes(termo.replace(/\D/g, "") || "-"))) &&
      (!sp.status || (sp.status === "ativo" ? c.active : !c.active)) &&
      (!sp.etapa || etapaDe.get(c.id) === sp.etapa)
  );
  clients.sort((a, b) => (abertasPorCliente.get(b.id)?.n ?? 0) - (abertasPorCliente.get(a.id)?.n ?? 0) || (abertasPorCliente.get(b.id)?.atrasadas ?? 0) - (abertasPorCliente.get(a.id)?.atrasadas ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
  const lista = ordenar(clients, sp.ordem, {
    nome: (c) => c.name,
    abertas: (c) => abertasPorCliente.get(c.id)?.n ?? 0,
    cadastro: (c) => c.created_at,
  });
  const ids = new Set(clients.map((c) => c.id));
  const alternar = (ver: "lista" | "pipeline") => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "ver") as [string, string][]);
    if (tipo === "PF") q.set("aba", "pf");
    if (ver === "pipeline") q.set("ver", "pipeline");
    return `/admin/clients${q.size ? `?${q}` : ""}`;
  };

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Contatos · Carteira</p>
          <h1 className="page-title">{arquivados ? "Clientes arquivados" : "Clientes"}</h1>
          <p className="text-sm text-muted">
            {clients.length} {clients.length === 1 ? "cliente" : "clientes"}
            {clients.length !== todos.length ? ` de ${todos.length}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {!arquivados && tipo === "PJ" && (
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
        <Link href={`/admin/clients?${new URLSearchParams({ ...(tipo === "PF" ? { aba: "pf" } : {}), ...(arquivados ? {} : { arquivados: "1" }) })}`} className="ui-btn-secondary">
          {arquivados ? <ArrowLeft className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
          {arquivados ? "Voltar aos ativos" : "Arquivados"}
        </Link>
        <Link href={`/admin/clients/new${tipo === "PF" ? "?tipo=PF" : ""}`} className="ui-btn">
          <Plus className="h-4 w-4" aria-hidden /> {tipo === "PF" ? "Nova pessoa" : "Nova empresa"}
        </Link>
        </div>
      </div>

      <nav className="mb-5 flex gap-6 border-b border-border" aria-label="Tipo de cliente">
        {([
          ["PJ", "Empresas", ""],
          ...(podePF ? ([["PF", "Pessoas", "pf"]] as const) : []),
        ] as const).map(([t, rotulo, aba]) => (
          <Link
            key={t}
            href={`/admin/clients?${new URLSearchParams({ ...(aba ? { aba } : {}), ...(arquivados ? { arquivados: "1" } : {}) })}`}
            aria-current={tipo === t ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-[15px] transition-colors ${tipo === t ? "border-navy-3 font-medium text-foreground" : "border-transparent text-foreground/65 hover:text-foreground"}`}
          >
            {rotulo}
            <span className={`rounded px-1.5 text-[11px] font-semibold ${qtd[t] ? "bg-navy-3 text-white" : "bg-surface-2 text-muted"}`}>{qtd[t]}</span>
          </Link>
        ))}
      </nav>

      <BarraFiltros
        filtros={[
          { tipo: "busca", nome: "busca", rotulo: tipo === "PF" ? "Buscar por nome, apelido, CPF, telefone ou e-mail" : "Buscar por nome, CNPJ ou e-mail" },
          { tipo: "select", nome: "status", rotulo: "Situação", todos: "Ativos e inativos", opcoes: [{ valor: "ativo", rotulo: "Ativos" }, { valor: "inativo", rotulo: "Inativos" }] },
          ...(arquivados || tipo === "PF" ? [] : [{ tipo: "select" as const, nome: "etapa", rotulo: "Etapa", todos: "Todas as etapas", opcoes: ETAPAS.map((e) => ({ valor: e.id, rotulo: e.rotulo })) }]),
        ]}
        ordenacao={{
          opcoes: [
            { valor: "", rotulo: "Mais demandas em aberto" },
            { valor: "nome", rotulo: "Nome (A a Z)" },
            { valor: "-nome", rotulo: "Nome (Z a A)" },
            { valor: "-cadastro", rotulo: "Cadastro mais recente" },
            { valor: "cadastro", rotulo: "Cadastro mais antigo" },
          ],
        }}
        exportar={{
          arquivo: tipo === "PF" ? "clientes-pessoas" : "clientes-empresas",
          colunas: ["Nome", "Apelido", tipo === "PF" ? "CPF" : "CNPJ", "E-mail", "Telefone", "Demandas em aberto", "Atrasadas", tipo === "PF" ? "Processos" : "Etapa", "Cadastro", "Situação"],
          linhas: lista.map((c) => [
            c.name,
            c.apelido,
            formatarDocumento(c.documento),
            c.email_contact,
            formatarTelefone(c.telefones?.[0]),
            abertasPorCliente.get(c.id)?.n ?? 0,
            abertasPorCliente.get(c.id)?.atrasadas ?? 0,
            tipo === "PF" ? (processosPorCliente.get(c.id) ?? 0) : ETAPAS.find((e) => e.id === etapaDe.get(c.id))?.rotulo,
            dataPlanilha(c.created_at),
            c.active ? "Ativo" : "Inativo",
          ]),
        }}
      />

      {verPipeline ? (
        <PipelineBoard cartoes={pipeline.filter((c) => ids.has(c.id))} />
      ) : (
      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-3 py-2.5 font-medium">Cliente</th>
              <th className="px-3 py-2.5 font-medium">Em aberto</th>
              <th className="px-3 py-2.5 font-medium">{tipo === "PF" ? "Telefone" : "Tipo"}</th>
              <th className="px-3 py-2.5 font-medium">{tipo === "PF" ? "Processos" : "Etapa"}</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Cadastro</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.length === 0 && (
              <tr>
                <td colSpan={6}>
                  {arquivados && !todos.length ? (
                    <ListaVazia icon={Users} filtrado={false} titulo="Nenhum cliente arquivado" dica="Os clientes que você arquivar aparecem aqui." />
                  ) : (
                    <ListaVazia
                      icon={Users}
                      filtrado={todos.length > 0}
                      titulo={tipo === "PF" ? "Nenhuma pessoa cadastrada ainda" : "Nenhuma empresa cadastrada ainda"}
                      dica="Cadastre o primeiro cliente para começar a lançar processos, demandas e documentos dele."
                      acao={{ href: `/admin/clients/new${tipo === "PF" ? "?tipo=PF" : ""}`, rotulo: tipo === "PF" ? "Nova pessoa" : "Nova empresa" }}
                    />
                  )}
                </td>
              </tr>
            )}
            {lista.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-3">
                  <Link href={`/admin/clients/${c.id}`} className="group flex items-center gap-3">
                    {/* foto do WhatsApp (0064); sem foto, as iniciais */}
                    {(c as { foto_url?: string | null }).foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto do bucket público avatars
                      <img src={(c as { foto_url?: string | null }).foto_url!} alt="" className="h-9 w-9 shrink-0 rounded-full bg-surface-2 object-cover ring-1 ring-border" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-gold-2">
                        {c.name.replace(/[^A-Za-zÀ-ú0-9 ]/g, "").trim().slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground underline-offset-2 group-hover:underline">{c.name}</span>
                      <span className="block text-xs text-muted">{[c.apelido && c.apelido !== c.name ? c.apelido : null, formatarDocumento(c.documento)].filter(Boolean).join(" · ")}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3 text-sm whitespace-nowrap">
                  {(() => {
                    const x = abertasPorCliente.get(c.id);
                    if (!x) return <span className="text-muted">—</span>;
                    return (
                      <span className="inline-flex items-center gap-2">
                        <span className="font-semibold text-foreground tabular-nums">{x.n}</span>
                        {x.atrasadas > 0 && <span className="rounded-full bg-status-danger-bg px-2 py-0.5 text-xs font-semibold text-status-danger">{x.atrasadas} {x.atrasadas === 1 ? "atrasada" : "atrasadas"}</span>}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-3 py-3 text-foreground/70">{tipo === "PF" ? (formatarTelefone(c.telefones?.[0]) || "—") : c.tipo_pessoa}</td>
                <td className="px-3 py-3 text-xs whitespace-nowrap text-foreground/75">
                  {tipo === "PF" ? (
                    processosPorCliente.get(c.id) ?? 0
                  ) : etapaDe.get(c.id) ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${COR_ETAPA[etapaDe.get(c.id)!]}`} aria-hidden />
                      {ETAPAS.find((e) => e.id === etapaDe.get(c.id))?.rotulo}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-3 text-foreground/70">
                  {new Date(c.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-3 py-3">
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
