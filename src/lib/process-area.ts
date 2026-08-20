import type { Database } from "@/lib/supabase/types";

export type ProcessArea = Database["public"]["Enums"]["process_area"];

export const PROCESS_AREA_LABEL: Record<ProcessArea, string> = {
  trabalhista: "Trabalhista",
  consumidor: "Consumidor",
  previdenciario: "Previdenciário",
  civel: "Cível",
  empresarial: "Empresarial",
};

export const PROCESS_AREAS = Object.keys(PROCESS_AREA_LABEL) as ProcessArea[];
