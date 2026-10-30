import { CONTRACT_STATUS_LABEL } from "@/lib/contract-status";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import Link from "next/link";
import { FileSignature, Pencil, Plus } from "lucide-react";
import { listContracts } from "@/lib/data/contracts";
import { StatusSelect } from "./status-select";
import { deleteContractAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { exigirPermissao } from "@/lib/dal";
import { ordenar, dataPlanilha } from "@/lib/ordenar";
import { ListaVazia } from "@/components/ui/empty-state";

type F = { busca?: string; cliente?: string; status?: string; ordem?: string };

export default async function AdminContractsPage({ searchParams }: { searchParams: Promise<F> }) {
  await exigirPermissao("contratos");
  const f = await searchParams;
  const todos = await listContracts();
  const termo = (f.busca ?? "").trim().toLowerCase();
  const filtrados = todos.filter(
    (c) =>
      (!termo || c.title.toLowerCase().includes(termo) || (c.description ?? "").toLowerCase().includes(termo) || (c.clients?.name ?? "").toLowerCase().includes(termo)) &&
      (!f.cliente || c.client_id === f.cliente) &&
      (!f.status || c.status === f.status)
  );

  const contracts = ordenar(filtrados, f.ordem, {
    inicio: (c) => c.start_date,
    valor: (c) => (c.value ? Number(c.value) : null),
    cliente: (c) => c.clients?.name,
    nome: (c) => c.title,
  });

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Arquivos · Contratos</p>
          <h1 className="page-title">Contratos</h1>
          <p className="text-sm text-muted">
            {contracts.length} {contracts.length === 1 ? "contrato cadastrado" : "contratos cadastrados"}
          </p>
        </div>
        <Link
          href="/admin/contracts/new"
          className="ui-btn"
        >
          <Plus className="h-4 w-4" aria-hidden /> Novo contrato
        </Link>
      </div>

      <BarraFiltros
        filtros={[
          { tipo: "busca", nome: "busca", rotulo: "Buscar contrato ou cliente" },
          { tipo: "select", nome: "cliente", rotulo: "Cliente", todos: "Todos os clientes", opcoes: [...new Map(todos.map((x) => [x.client_id, x.clients?.name ?? "Cliente"])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([valor, rotulo]) => ({ valor, rotulo })) },
          { tipo: "select", nome: "status", rotulo: "Status", todos: "Todos os status", opcoes: Object.entries(CONTRACT_STATUS_LABEL).map(([valor, rotulo]) => ({ valor, rotulo })) },
        ]}
        ordenacao={{
          opcoes: [
            { valor: "", rotulo: "Padrão" },
            { valor: "-inicio", rotulo: "Início mais recente" },
            { valor: "inicio", rotulo: "Início mais antigo" },
            { valor: "-valor", rotulo: "Maior valor" },
            { valor: "cliente", rotulo: "Cliente (A a Z)" },
            { valor: "nome", rotulo: "Nome (A a Z)" },
          ],
        }}
        exportar={{
          arquivo: "contratos",
          colunas: ["Contrato", "Cliente", "Início", "Valor (R$)", "Status"],
          linhas: contracts.map((c) => [
            c.title,
            c.clients?.name,
            dataPlanilha(c.start_date),
            c.value ? Number(c.value).toFixed(2).replace(".", ",") : "",
            CONTRACT_STATUS_LABEL[c.status as keyof typeof CONTRACT_STATUS_LABEL] ?? c.status,
          ]),
        }}
      />

      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-5 py-2.5 font-medium">Contrato</th>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Início</th>
              <th className="px-5 py-2.5 font-medium">Valor</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contracts.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <ListaVazia
                    icon={FileSignature}
                    filtrado={todos.length > 0}
                    titulo="Nenhum contrato cadastrado ainda"
                    dica="Cadastre o primeiro contrato de honorários para ter valor, início e status num lugar só."
                    acao={{ href: "/admin/contracts/new", rotulo: "Novo contrato" }}
                  />
                </td>
              </tr>
            )}
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-medium text-foreground">{c.title}</td>
                <td className="px-5 py-3 text-foreground/70">{c.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">{formatDate(c.start_date)}</td>
                <td className="px-5 py-3 tabular-nums text-foreground/70">
                  {c.value ? formatCurrency(Number(c.value)) : "—"}
                </td>
                <td className="px-5 py-3">
                  <StatusSelect id={c.id} status={c.status} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-0.5">
                    <Link href={`/admin/contracts/${c.id}/edit`} className="icon-btn" aria-label="Editar" data-tip="Editar"><Pencil aria-hidden /></Link>
                    <ConfirmSubmitButton
                      action={deleteContractAction}
                      hiddenFields={{ id: c.id }}
                      confirmMessage={`Excluir o contrato "${c.title}"?`}
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
