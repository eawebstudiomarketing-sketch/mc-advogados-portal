import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Documentos que o escritório pediu ao cliente (Ficha de Handoff, seção 11:
// "Documentos que o cliente se comprometeu a enviar", e as cobranças de
// documento ativas das atividades, 03/11/2026). O cliente não lê a ficha nem a
// atividade; o servidor extrai só esta lista. Um item conta como enviado quando
// existe documento do cliente com requested_item igual ao nome do item.

export type PedidoDocumento = { item: string; enviado: boolean; enviadoEm: string | null };

export async function pedidosDoCliente(clientId: string): Promise<PedidoDocumento[]> {
  const db = createAdminClient();
  const [{ data: ficha }, { data: docs }, { data: cobrancas }] = await Promise.all([
    db.from("client_handoffs").select("handoff").eq("client_id", clientId).maybeSingle(),
    db.from("documents").select("requested_item, created_at").eq("client_id", clientId).not("requested_item", "is", null),
    // tabela da migration 0065 (fora do types.ts gerado)
    (db as unknown as SupabaseClient).from("cobrancas_documentos").select("documentos").eq("client_id", clientId).eq("ativa", true),
  ]);
  const h = (ficha?.handoff ?? {}) as Record<string, unknown>;
  const itens = [
    ...((Array.isArray(h.documentos) ? h.documentos : []) as string[]),
    ...(typeof h.documentos_outro === "string" && h.documentos_outro.trim()
      ? h.documentos_outro.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
      : []),
    ...((cobrancas ?? []) as { documentos: string[] }[]).flatMap((c) => c.documentos ?? []),
  ];
  return [...new Set(itens)].map((item) => {
    const doc = (docs ?? []).find((d) => d.requested_item === item);
    return { item, enviado: !!doc, enviadoEm: doc?.created_at ?? null };
  });
}

/** Categoria do documento a partir do item pedido. */
export function categoriaDoItem(item: string | null): "contrato" | "pessoal" | "outros" {
  if (!item) return "outros";
  const i = item.toLowerCase();
  if (i.includes("contrat")) return "contrato";
  if (i.includes("funcion")) return "pessoal";
  return "outros";
}
