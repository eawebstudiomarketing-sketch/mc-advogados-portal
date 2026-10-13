import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Documentos que o escritório pediu ao cliente (Ficha de Handoff, seção 11:
// "Documentos que o cliente se comprometeu a enviar"). O cliente não lê a
// ficha; o servidor extrai só esta lista. Um item conta como enviado quando
// existe documento do cliente com requested_item igual ao nome do item.

export type PedidoDocumento = { item: string; enviado: boolean; enviadoEm: string | null };

export async function pedidosDoCliente(clientId: string): Promise<PedidoDocumento[]> {
  const db = createAdminClient();
  const [{ data: ficha }, { data: docs }] = await Promise.all([
    db.from("client_handoffs").select("handoff").eq("client_id", clientId).maybeSingle(),
    db.from("documents").select("requested_item, created_at").eq("client_id", clientId).not("requested_item", "is", null),
  ]);
  const h = (ficha?.handoff ?? {}) as Record<string, unknown>;
  const itens = [
    ...((Array.isArray(h.documentos) ? h.documentos : []) as string[]),
    ...(typeof h.documentos_outro === "string" && h.documentos_outro.trim()
      ? h.documentos_outro.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
      : []),
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
