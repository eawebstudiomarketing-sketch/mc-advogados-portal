import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { getClient } from "@/lib/data/clients";

export default async function AdminClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  return (
    <div>
      <Link href="/admin/clients" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para clientes
      </Link>

      <div className="mt-3 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">{client.name}</h1>
          <p className="text-sm text-foreground/50">
            {client.tipo_pessoa} · {client.documento} · {client.email_contact}
          </p>
        </div>
        <StatusBadge status={client.active ? "ativo" : "inativo"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Atividades</h2>
          <p className="mt-3 text-sm text-foreground/50">Módulo ainda não conectado ao Supabase.</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Processos</h2>
          <p className="mt-3 text-sm text-foreground/50">Módulo ainda não conectado ao Supabase.</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Documentos</h2>
          <p className="mt-3 text-sm text-foreground/50">Módulo ainda não conectado ao Supabase.</p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Contratos</h2>
          <p className="mt-3 text-sm text-foreground/50">Módulo ainda não conectado ao Supabase.</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-navy">Financeiro</h2>
        <p className="mt-3 text-sm text-foreground/50">Módulo ainda não conectado ao Supabase.</p>
      </div>
    </div>
  );
}
