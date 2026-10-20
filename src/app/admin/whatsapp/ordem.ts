import { createClient } from "@/lib/supabase/client";
import { ordemAction } from "./actions";

// Manda uma ordem ao Agente e acompanha a resposta pelo navegador (sem prender
// as outras ações da tela no servidor).

let sb: ReturnType<typeof createClient> | null = null;
const banco = () => (sb ??= createClient());

function traduzirErro(e: string | null | undefined): string {
  const t = e ?? "";
  if (/not-authorized|forbidden|403/i.test(t)) return "O WhatsApp não deixou: é preciso ser administrador do grupo.";
  if (/item-not-found|404/i.test(t)) return "O WhatsApp não encontrou isso (pode já ter sido removido).";
  return t || "Não deu certo.";
}

export async function executarOrdem(
  tipo: string,
  payload: Record<string, unknown>,
  { esperar = true }: { esperar?: boolean } = {}
): Promise<{ ok: boolean; erro?: string; resultado?: Record<string, unknown> }> {
  const r = await ordemAction(tipo, payload);
  if (!r.ok || !r.jobId || !esperar) return { ok: r.ok, erro: r.erro };
  const fim = Date.now() + 30_000;
  let espera = 250;
  while (Date.now() < fim) {
    await new Promise((ok) => setTimeout(ok, espera));
    espera = Math.min(espera + 150, 800);
    const { data } = await banco().from("wa_jobs").select("status, resultado, erro").eq("id", r.jobId).maybeSingle();
    if (data?.status === "concluido") return { ok: true, resultado: (data.resultado ?? {}) as Record<string, unknown> };
    if (data?.status === "erro" || data?.status === "cancelado") return { ok: false, erro: traduzirErro(data.erro) };
  }
  return { ok: false, erro: "O WhatsApp demorou para responder. A ação ficou na fila e deve sair em instantes." };
}
