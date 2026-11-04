"use server";

import { requireRole } from "@/lib/dal";
import { marcarNovidadesVistas } from "@/lib/novidades";

/** Fechou a janela de novidades: não abre mais sozinha (continua em Novidades). */
export async function novidadeVistaAction(id: string): Promise<void> {
  const profile = await requireRole(["admin", "advogado"]);
  if (/^[0-9a-f-]{36}$/i.test(id)) await marcarNovidadesVistas(profile.id, id);
}
