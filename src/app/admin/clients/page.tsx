import Link from "next/link";
import { Plus, Archive, ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { listClients } from "@/lib/data/clients";
import { exigirPermissao } from "@/lib/dal";

export default async function AdminClientsPage({ searchParams }: { searchParams: Promise<{ arquivados?: string }> }) {
  await exigirPermissao("clientes");
  const arquivados = (await searchParams).arquivados === "1";
  const clients = await listClients({ arquivados });

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{arquivados ? "Clientes arquivados" : "Clientes"}</h1>
          <p className="text-sm text-muted">
            {clients.length} {clients.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <Link href={arquivados ? "/admin/clients" : "/admin/clients?arquivados=1"} className="ui-btn-secondary">
          {arquivados ? <ArrowLeft className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
          {arquivados ? "Voltar aos ativos" : "Arquivados"}
        </Link>
        <Link href="/admin/clients/new" className="ui-btn">
          <Plus className="h-4 w-4" aria-hidden /> Novo cliente
        </Link>
        </div>
      </div>

      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Tipo</th>
              <th className="px-5 py-2.5 font-medium">Cadastrado em</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted">
                  {arquivados ? "Nenhum cliente arquivado." : "Nenhum cliente cadastrado ainda."}
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3">
                  <Link href={`/admin/clients/${c.id}`} className="group flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy text-[11px] font-semibold text-gold-2">
                      {c.name.replace(/[^A-Za-zÀ-ú0-9 ]/g, "").trim().slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground underline-offset-2 group-hover:underline">{c.name}</span>
                      <span className="block text-xs text-muted">{c.documento}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-5 py-3 text-foreground/70">{c.tipo_pessoa}</td>
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
    </div>
  );
}
