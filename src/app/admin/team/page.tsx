import Link from "next/link";
import { listStaff } from "@/lib/data/team";
import { requireRole } from "@/lib/dal";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  advogado: "Advogado(a)",
};

export default async function AdminTeamPage() {
  await requireRole(["admin"]);
  const staff = await listStaff();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Equipe</h1>
          <p className="text-sm text-foreground/50">
            {staff.length} {staff.length === 1 ? "pessoa com acesso ao painel" : "pessoas com acesso ao painel"}
          </p>
        </div>
        <Link
          href="/admin/team/new"
          className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90"
        >
          Convidar pessoa
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Nome</th>
              <th className="px-5 py-3 font-medium">E-mail</th>
              <th className="px-5 py-3 font-medium">Papel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {staff.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-sm text-foreground/50">
                  Nenhuma pessoa cadastrada ainda.
                </td>
              </tr>
            )}
            {staff.map((t) => (
              <tr key={t.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{t.full_name}</td>
                <td className="px-5 py-3 text-foreground/70">{t.email}</td>
                <td className="px-5 py-3 text-foreground/70">{ROLE_LABEL[t.role] ?? t.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
