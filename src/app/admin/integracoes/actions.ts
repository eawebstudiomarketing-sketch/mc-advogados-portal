"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearDriveHealthCache } from "@/lib/google-drive";

// Desconectar só apaga a autorização guardada no portal. Os arquivos já
// enviados continuam no Drive; novos uploads voltam a ir pro Supabase Storage
// até reconectar. Documentos que já estão no Drive não abrem enquanto estiver
// desconectado.
export async function disconnectDriveAction(): Promise<void> {
  await requireRole(["admin"]);
  await createAdminClient().from("drive_connection").delete().eq("id", true);
  clearDriveHealthCache();
  revalidatePath("/admin/integracoes");
}
