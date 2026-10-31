import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cronAutorizado } from "@/lib/seguranca";
import { createAdminClient } from "@/lib/supabase/admin";
import { processarRevista, revistasRecentesINPI } from "@/lib/marcas/revista";
import { sincronizarLote } from "@/lib/marcas/sincronizar";
import { enviarMarca, getConfigEnvio, listMarcasZap, listModelos, modeloPara, montarMensagem, statusDaMensagem } from "@/lib/marcas/zap";

// Marcas (INPI), todo dia às 07h da Bahia: lê a revista nova assim que sai
// (terça), atualiza no pePI as marcas conferidas há mais tempo e, se o envio
// estiver no automático, manda o informativo do WhatsApp no dia do mês escolhido.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const db = () => createAdminClient() as unknown as SupabaseClient;
const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const inicio = Date.now();
  const saida: Record<string, unknown> = {};
  try {
    const recentes = await revistasRecentesINPI();
    const ultima = recentes.sort((a, b) => b.numero - a.numero)[0];
    if (ultima) saida.revista = await processarRevista(ultima.numero, { prazoMs: 150_000, pdfs: ultima.pdfs });
  } catch (e) {
    saida.erroRevista = (e as Error).message;
  }
  // o tempo que sobrar vai para conferir a situação no INPI
  saida.sincronia = await sincronizarLote(12, Math.max(20_000, 250_000 - (Date.now() - inicio)));

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
