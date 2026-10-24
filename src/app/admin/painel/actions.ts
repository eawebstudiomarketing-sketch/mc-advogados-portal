"use server";

import { revalidatePath } from "next/cache";
import { exigirSuperAdmin } from "@/lib/dal";
import { gerarSugestoes, vezesRefeitasHoje } from "@/lib/painel/sugestao";

const LIMITE_POR_DIA = 3; // gasto mínimo: cada "gerar de novo" é 1 chamada barata

export async function refazerSugestoesAction(): Promise<{ error?: string }> {
  await exigirSuperAdmin();
  if ((await vezesRefeitasHoje()) >= LIMITE_POR_DIA) return { error: `Já foi gerada de novo ${LIMITE_POR_DIA} vezes hoje. Amanhã às 7h sai a nova.` };
  const r = await gerarSugestoes({ refazer: true });
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/painel");
  return {};
}
