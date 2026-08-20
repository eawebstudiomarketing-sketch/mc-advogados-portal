import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { listClients } from "@/lib/data/clients";
import { getProfile } from "@/lib/dal";

export default async function AdminClientsPage() {
  const [clients, profile] = await Promise.all([listClients(), getProfile()]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Clientes</h1>
          <p className="text-sm text-foreground/50">
            {clients.length} {clients.length === 1 ? "cliente cadastrado" : "clientes cadastrados"}
          </p>
        </div>
        {profile?.role === "admin" && (
          <Link
            href="/admin/clients/new"
            className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90"
          >
            Novo cliente
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Tipo</th>
              <th className="px-5 py-3 font-medium">Cadastrado em</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-foreground/50">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-background">
                <td className="px-5 py-3">
                  <Link href={`/admin/clients/${c.id}`} className="font-medium text-navy hover:underline">
                    {c.name}
                  </Link>
                  <p className="text-xs text-foreground/50">{c.documento}</p>
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
