import type { Database } from "@/lib/supabase/types";

export type DocumentCategory = Database["public"]["Enums"]["document_category"];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  contrato: "Contrato",
  processo: "Processo",
  financeiro: "Financeiro",
  pessoal: "Pessoal",
  outros: "Outros",
  ata: "ATA",
};

// ATA fica fora dos formulários genéricos: é cadastrada só pelo cartão "ATAs" da
// ficha do cliente (arquivo em pasta interna, invisível para o cliente).
export const DOCUMENT_CATEGORIES = (Object.keys(DOCUMENT_CATEGORY_LABEL) as DocumentCategory[]).filter((c) => c !== "ata");
