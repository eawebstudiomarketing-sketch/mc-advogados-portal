import { redirect } from "next/navigation";

// Módulo desativado a pedido do usuário (2026-08-25) — ver src/app/admin/timesheet/page.tsx.
export default async function NewTimeEntryPage() {
  redirect("/admin");
}
