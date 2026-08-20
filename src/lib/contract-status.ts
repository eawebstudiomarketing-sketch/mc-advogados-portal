import type { Database } from "@/lib/supabase/types";

export type ContractStatus = Database["public"]["Enums"]["contract_status"];

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  active: "Ativo",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export const CONTRACT_STATUSES = Object.keys(CONTRACT_STATUS_LABEL) as ContractStatus[];
