import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cronAutorizado } from "@/lib/seguranca";
import { createAdminClient } from "@/lib/supabase/admin";
import { processarRevista, processarRevistaPatentes, revistasRecentesINPI } from "@/lib/marcas/revista";
import { avisarEquipeDaRevista } from "@/lib/marcas/aviso-equipe";
import { enviarMarca, getConfigEnvio, listMarcasZap, listModelos, modeloPara, montarMensagem, statusDaMensagem } from "@/lib/marcas/zap";

// Marcas (INPI), todo dia às 07h da Bahia: lê a revista nova assim que sai
// (terça) e, se o envio
// estiver no automático, manda o informativo do WhatsApp no dia do mês escolhido.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const db = () => createAdminClient() as unknown as SupabaseClient;
const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const saida: Record<string, unknown> = {};
  try {
    const recentes = await revistasRecentesINPI();
    const ultima = recentes.sort((a, b) => b.numero - a.numero)[0];
    if (ultima) {
      const lida = await processarRevista(ultima.numero, { prazoMs: 150_000, pdfs: ultima.pdfs });
      saida.revista = lida;
      // patentes: só na primeira leitura da revista (depois ela vem marcada como pulada)
      // 17/11/2026: avisa a equipe no WhatsApp (Maurício + responsável de cada marca), 1x por revista
      saida.avisoEquipe = await avisarEquipeDaRevista(ultima.numero).catch((e: Error) => ({ erro: e.message }));
      if (!("pulada" in lida)) saida.patentes = await processarRevistaPatentes(ultima.numero, ultima.data).catch((e: Error) => ({ erro: e.message }));
    }
  } catch (e) {
    saida.erroRevista = (e as Error).message;
  }
  // a conferência marca a marca no pePI roda de madrugada pela VPS (/api/cron/marcas/sincronizar)

  const config = await getConfigEnvio();
  const hoje = hojeBahia();
  if (config.envio_modo === "automatico" && Number(hoje.slice(8)) === config.envio_dia && config.ultimo_envio_auto !== hoje) {
    await db().from("marca_config").update({ ultimo_envio_auto: hoje }).eq("id", 1);
    const [marcas, modelos] = await Promise.all([listMarcasZap(), listModelos()]);
    let enviados = 0;
    for (const m of marcas.filter((x) => x.avisar_cliente && x.contato_numero)) {
      const modelo = modeloPara(statusDaMensagem(m), modelos);
      if (modelo && (await enviarMarca(m, montarMensagem(m, modelo.texto), null)).ok) enviados++;
    }
    saida.zap = { enviados };
  }
  return NextResponse.json({ ok: true, ...saida });
}
