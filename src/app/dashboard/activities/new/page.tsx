import { requireRole } from "@/lib/dal";
import { ActivityForm } from "./activity-form";
import { BackButton } from "@/components/nav/back-button";

export default async function NewOwnActivityPage() {
  await requireRole(["client"]);

  return (
    <div>
      <BackButton fallback="/dashboard/activities" />

      <h1 className="mt-3 mb-6 page-title">Nova atividade</h1>

      <ActivityForm />
    </div>
  );
}
