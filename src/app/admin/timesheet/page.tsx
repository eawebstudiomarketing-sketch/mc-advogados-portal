import { redirect } from "next/navigation";

// Módulo desativado a pedido do usuário (2026-08-25) — dados de time_entries
// preservados no banco, só o acesso foi removido. Reativar: restaurar a
// listagem (ver histórico do git/backup) e o link de volta no admin-shell.
export default async function AdminTimesheetPage() {
  redirect("/admin");
}
