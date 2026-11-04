"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";

// Busca rápida do topo (Ctrl+K), 04/11/2026: além de telas e clientes, procura
// PROCESSOS (pelo número, com ou sem pontos e traço, pelo título/partes ou pela
// vara) e ATIVIDADES (pelo título). Antes ela prometia "processo" e não achava:
// o Maurício digitou o número só com dígitos e não encontrou um processo que já
// estava no portal. Respeita o que cada pessoa pode ver (regras do banco).

export type ResultadoBuscaRapida = { href: string; label: string; hint?: string; group: "Processos" | "Atividades" };

export async function buscaRapidaAction(termo: string): Promise<ResultadoBuscaRapida[]> {
  await requireRole(["admin", "advogado"]);
  const t = termo.trim().replace(/[,()%*\\]/g, " ").trim();
  if (t.length < 3) return [];
  const digitos = t.replace(/\D/g, "");
  const db = await createClient();
  const filtroProc =
    digitos.length >= 4 && digitos.length >= t.replace(/\s/g, "").length - 4
      ? `numero_digitos.ilike.%${digitos}%`
      : `titulo.ilike.%${t}%,numero_processo.ilike.%${t}%,vara_tribunal.ilike.%${t}%,cliente_nome.ilike.%${t}%`;
  const [{ data: procs }, { data: ativs }] = await Promise.all([
    db.from("processes").select("id, numero_processo, titulo, clients(name)").or(filtroProc).limit(8),
    digitos.length >= 6 ? Promise.resolve({ data: [] as { id: string; title: string; status: string }[] }) : db.from("activities").select("id, title, status").ilike("title", `%${t}%`).is("archived_at", null).limit(6),
  ]);
  return [
    ...(procs ?? []).map((p) => ({
      href: `/admin/processes/${p.id}`,
      label: p.titulo ? `${p.numero_processo} · ${p.titulo}` : p.numero_processo,
      hint: `${p.numero_processo} ${(p.clients as unknown as { name: string } | null)?.name ?? "sem cliente"}`,
      group: "Processos" as const,
    })),
    ...(ativs ?? []).map((a) => ({ href: `/admin/activities/${a.id}`, label: a.title, hint: a.status, group: "Atividades" as const })),
  ];
}
