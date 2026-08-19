import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { mockClients } from "@/lib/mock-data";

export default function AdminClientsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Clientes</h1>
          <p className="text-sm text-foreground/50">{mockClients.length} clientes cadastrados</p>
        </div>
        <button className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90">
          Novo cliente
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Tipo</th>
              <th className="px-5 py-3 font-medium">Horas no mês</th>
              <th className="px-5 py-3 font-medium">Financeiro</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockClients.map((c) => (
              <tr key={c.id} className="hover:bg-background">
                <td className="px-5 py-3">
                  <Link href={`/admin/clients/${c.id}`} className="font-medium text-navy hover:underline">
                    {c.name}
                  </Link>
                  <p className="text-xs text-foreground/50">{c.documento}</p>
                </td>
                <td className="px-5 py-3 text-foreground/70">{c.tipoPessoa}</td>
                <td className="px-5 py-3 tabular-nums text-foreground/70">{c.horasMes}h</td>
                <td className="px-5 py-3">
                  <StatusBadge status={c.statusFinanceiro} />
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={c.ativo ? "ativo" : "inativo"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
