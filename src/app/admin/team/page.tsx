import Link from "next/link";
import { listStaff } from "@/lib/data/team";
import { requireRole } from "@/lib/dal";
import { removeStaffAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  advogado: "Advogado(a)",
};

export default async function AdminTeamPage() {
  const currentProfile = await requireRole(["admin"]);
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
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {staff.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-foreground/50">
                  Nenhuma pessoa cadastrada ainda.
                </td>
              </tr>
            )}
            {staff.map((t) => (
              <tr key={t.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{t.full_name}</td>
                <td className="px-5 py-3 text-foreground/70">{t.email}</td>
                <td className="px-5 py-3 text-foreground/70">{ROLE_LABEL[t.role] ?? t.role}</td>
                <td className="px-5 py-3 text-right">
                  {t.id !== currentProfile.id && (
                    <ConfirmSubmitButton
                      action={removeStaffAction}
                      hiddenFields={{ profile_id: t.id, user_id: t.user_id }}
                      confirmMessage={`Remover o acesso de ${t.full_name}? Essa ação não pode ser desfeita.`}
                      label="Remover acesso"
                      className="text-xs font-medium text-status-danger hover:underline"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
