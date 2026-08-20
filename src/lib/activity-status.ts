import type { Database } from "@/lib/supabase/types";

export type ActivityStatus = Database["public"]["Enums"]["activity_status"];

export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const ACTIVITY_STATUSES = Object.keys(ACTIVITY_STATUS_LABEL) as ActivityStatus[];
