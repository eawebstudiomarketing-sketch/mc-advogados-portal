import type { Database } from "@/lib/supabase/types";

export type ActivityType = Database["public"]["Enums"]["activity_type"];

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  consultoria: "Consultoria",
  processo: "Processo",
  contrato: "Contrato",
  reuniao: "Reunião",
  pesquisa: "Pesquisa",
  audiencia: "Audiência",
};

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[];
