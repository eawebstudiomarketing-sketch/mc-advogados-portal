import { redirect } from "next/navigation";

// Andamentos agora ficam em Alertas → aba Andamentos (como no Astrea).
export default async function AndamentosPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  redirect(p && /^[0-9a-f-]{36}$/i.test(p) ? `/admin/alertas/andamentos/${p}` : "/admin/alertas?aba=andamentos");
}
