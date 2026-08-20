import type { Database } from "@/lib/supabase/types";

export type DocumentCategory = Database["public"]["Enums"]["document_category"];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  contrato: "Contrato",
  processo: "Processo",
  financeiro: "Financeiro",
  pessoal: "Pessoal",
  outros: "Outros",
};

export const DOCUMENT_CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABEL) as DocumentCategory[];
