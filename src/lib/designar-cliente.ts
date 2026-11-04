import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Regra (04/11/2026): quem adiciona um processo vira responsável por ele E pelo
 * cliente dele: passa a ficar designado ao cliente (equipe_clientes), o que
 * também libera ver o cliente para quem é advogado. Não tira quem já estava.
 */
export async function designarClienteA(profileId: string | null | undefined, clientId: string | null | undefined): Promise<void> {
  if (!profileId || !clientId) return;
  const { error } = await createAdminClient().from("equipe_clientes").upsert({ profile_id: profileId, client_id: clientId }, { onConflict: "profile_id,client_id", ignoreDuplicates: true });
  if (error) console.error("designar cliente:", error.message);
}
