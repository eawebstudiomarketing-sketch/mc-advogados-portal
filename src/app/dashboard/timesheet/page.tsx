import { redirect } from "next/navigation";

// Módulo desativado a pedido do usuário (2026-08-25) — dados de time_entries
// preservados no banco, só o acesso foi removido.
export default async function ClientTimesheetPage() {
  redirect("/dashboard");
}
