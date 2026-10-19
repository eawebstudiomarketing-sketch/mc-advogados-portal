import { ehSuperAdmin, exigirPermissao } from "@/lib/dal";
import { NewStaffForm } from "./new-staff-form";
import { BackButton } from "@/components/nav/back-button";

export default async function NewStaffPage() {
  const { profile } = await exigirPermissao("equipe");

  return (
    <div>
      <BackButton fallback="/admin/team" />

      <h1 className="mt-3 mb-6 page-title">Convidar pessoa</h1>

      <NewStaffForm podeAdmin={ehSuperAdmin(profile)} />
    </div>
  );
}
