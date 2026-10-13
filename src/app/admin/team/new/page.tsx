import { requireRole } from "@/lib/dal";
import { NewStaffForm } from "./new-staff-form";
import { BackButton } from "@/components/nav/back-button";

export default async function NewStaffPage() {
  await requireRole(["admin"]);

  return (
    <div>
      <BackButton fallback="/admin/team" />

      <h1 className="mt-3 mb-6 page-title">Convidar pessoa</h1>

      <NewStaffForm />
    </div>
  );
}
