import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";

// Saúde dos robôs (29/10/2026). Cada robô chama registrarRobo() ao fim de cada rodada:
//  - deu certo  -> verde; se estava amarelo/vermelho, avisa que voltou;
//  - falhou 1-2x seguidas -> amarelo ("atenção"), ainda tentando sozinho;
//  - falhou 3x seguidas, ou ficou mais de 2 intervalos sem ler nada -> vermelho ("fora") + e-mail.
// O vigia (verificarSinais, de hora em hora) marca vermelho quem parou de dar sinal: é o que
// pega robô travado, VPS desligada ou agendamento que parou de rodar. Nunca quebra em silêncio.

type Db = SupabaseClient;
const db = () => createAdminClient() as unknown as Db;
const EMAIL_ALERTAS = "eawebstudiomarketing@gmail.com";

export type MotivoFalha = "captcha" | "bloqueio" | "fora_do_ar" | "layout" | "vazio" | "sem_sinal" | "erro";

export const MOTIVO_TEXTO: Record<MotivoFalha, string> = {
  captcha: "o captcha do tribunal mudou ou não está passando",
  bloqueio: "o tribunal bloqueou o acesso do robô",
  fora_do_ar: "o site do tribunal está fora do ar ou lento",
  layout: "a página do tribunal mudou de formato",
  vazio: "a consulta voltou vazia (pode ser falha silenciosa)",
  sem_sinal: "o robô parou de dar sinal",
  erro: "erro inesperado no robô",
};

export type Rodada = {
  robo: string;
  nome: string;
  grupo?: "andamentos" | "publicacoes" | "integracoes";
  ok: boolean;
  motivo?: MotivoFalha | null;
  detalhe?: string | null;
  usandoReserva?: boolean;
  /** de quanto em quanto tempo o robô roda; sem sinal por mais que isso vira "fora" */
  intervaloMin?: number;
};

type Linha = {
  robo: string;
  nome: string;
  status: "ok" | "atencao" | "fora" | "pausado";
  motivo: string | null;
  detalhe: string | null;
  falhas_seguidas: number;
  ultima_ok: string | null;
  intervalo_min: number;
  desde: string;
  avisado_em: string | null;
  usando_reserva: boolean;
};

const horaBR = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" }) : "nunca";

/** Classifica uma mensagem de erro técnica no motivo que aparece pra equipe. */
export function classificarErro(erro: unknown): MotivoFalha {
  const t = String((erro as Error)?.message ?? erro ?? "").toLowerCase();
  if (/captcha|desafio|turnstile|recaptcha|hcaptcha/.test(t)) return "captcha";
  if (/\b403\b|forbidden|access denied|bloque/.test(t)) return "bloqueio";
  if (/timeout|timed out|econn|enotfound|\b50[234]\b|fetch failed|socket|unavailable|internet/.test(t)) return "fora_do_ar";
  if (/selector|locator|não apareceu|sem eventos|layout|parse|json/.test(t)) return "layout";
  return "erro";
}

async function avisarEmail(assunto: string, corpo: string) {
  const r = getResendClient();
  if (r) await r.client.emails.send({ from: r.from, to: EMAIL_ALERTAS, subject: assunto, text: corpo }).catch(() => undefined);
}

async function mudarStatus(antes: Linha | null, depois: Partial<Linha> & { robo: string; nome: string; status: Linha["status"] }) {
  const agora = new Date().toISOString();
  const mudou = !antes || antes.status !== depois.status;
  const linha = { ...depois, desde: mudou ? agora : antes!.desde, atualizado_em: agora };
  await db().from("robos_status").upsert(linha);
  if (mudou) {
    await db().from("robos_eventos").insert({ robo: depois.robo, status: depois.status, motivo: depois.motivo ?? null, detalhe: depois.detalhe ?? null });
  }
  // e-mail: ao ficar vermelho (no máximo 1 a cada 6 h) e ao voltar ao normal depois de vermelho
  if (depois.status === "fora" && (!antes?.avisado_em || Date.now() - Date.parse(antes.avisado_em) > 6 * 3_600_000)) {
    const motivo = depois.motivo ? MOTIVO_TEXTO[depois.motivo as MotivoFalha] ?? depois.motivo : "motivo não identificado";
    await avisarEmail(
      `🔴 Robô fora do ar: ${depois.nome}`,
      `O robô "${depois.nome}" está fora do ar.\nMotivo: ${motivo}.\n${depois.detalhe ? `Detalhe: ${depois.detalhe}\n` : ""}Última leitura com sucesso: ${horaBR(depois.ultima_ok ?? antes?.ultima_ok ?? null)}.\n${depois.usando_reserva ? "Enquanto isso, a reserva está cobrindo.\n" : ""}\nVeja em: https://mcadvogados.app.br/admin/alertas?aba=robos`
    );
    await db().from("robos_status").update({ avisado_em: agora }).eq("robo", depois.robo);
  } else if (depois.status === "ok" && antes?.status === "fora") {
    await avisarEmail(`🟢 Robô voltou: ${depois.nome}`, `O robô "${depois.nome}" voltou a funcionar em ${horaBR(agora)}.`);
  }
}

/** Registra o resultado de uma rodada de um robô. Nunca lança erro (não pode derrubar o robô). */
export async function registrarRobo(r: Rodada): Promise<void> {
  try {
    const { data: antes } = await db().from("robos_status").select("*").eq("robo", r.robo).maybeSingle<Linha>();
    const agora = new Date().toISOString();
    const base = { robo: r.robo, nome: r.nome, grupo: r.grupo ?? "andamentos", intervalo_min: r.intervaloMin ?? antes?.intervalo_min ?? 180, ultima_tentativa: agora };
    if (antes?.status === "pausado") return;
    if (r.ok) {
      await mudarStatus(antes, { ...base, status: "ok", motivo: null, detalhe: null, falhas_seguidas: 0, ultima_ok: agora, usando_reserva: false });
      return;
    }
    const falhas = (antes?.falhas_seguidas ?? 0) + 1;
    const semLerHaMuito = !antes?.ultima_ok || Date.now() - Date.parse(antes.ultima_ok) > 2 * base.intervalo_min * 60_000;
    await mudarStatus(antes, {
      ...base,
      status: falhas >= 3 || semLerHaMuito ? "fora" : "atencao",
      motivo: r.motivo ?? "erro",
      detalhe: r.detalhe?.slice(0, 500) ?? null,
      falhas_seguidas: falhas,
      ultima_ok: antes?.ultima_ok ?? null,
      usando_reserva: !!r.usandoReserva,
    });
  } catch {
    // o registro de saúde nunca pode quebrar o robô que está sendo monitorado
  }
}

/** Vigia (de hora em hora): quem passou do intervalo sem dar sinal vira "fora". */
export async function verificarSinais(): Promise<string[]> {
  const out: string[] = [];
  // Agente do WhatsApp (VPS): manda batimento a cada poucos segundos para wa_agent.
  const { data: ag } = await db().from("wa_agent").select("last_heartbeat").order("last_heartbeat", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const bat = ag?.last_heartbeat ? Date.parse(ag.last_heartbeat as string) : 0;
  const vivo = Date.now() - bat < 10 * 60_000;
  await registrarRobo({
    robo: "agente-whatsapp",
    nome: "Agente do WhatsApp (VPS)",
    grupo: "integracoes",
    ok: vivo,
    motivo: vivo ? null : "sem_sinal",
    detalhe: vivo ? null : `Último sinal do agente: ${horaBR(ag?.last_heartbeat as string | null)}.`,
    intervaloMin: 60,
  });
  if (!vivo) out.push("agente-whatsapp: sem sinal");

  const { data } = await db().from("robos_status").select("*").neq("status", "pausado");
  for (const r of (data ?? []) as (Linha & { ultima_tentativa: string | null })[]) {
    const ultimo = r.ultima_tentativa ? Date.parse(r.ultima_tentativa) : 0;
    const limite = 1.5 * r.intervalo_min * 60_000;
    if (Date.now() - ultimo > limite && !(r.status === "fora" && r.motivo === "sem_sinal")) {
      await mudarStatus(r, {
        robo: r.robo,
        nome: r.nome,
        status: "fora",
        motivo: "sem_sinal",
        detalhe: `Nenhuma rodada desde ${horaBR(r.ultima_tentativa)} (era pra rodar a cada ${Math.round(r.intervalo_min / 60) || 1} h).`,
        falhas_seguidas: r.falhas_seguidas,
        ultima_ok: r.ultima_ok,
        usando_reserva: r.usando_reserva,
      });
      out.push(`${r.robo}: sem sinal`);
    }
  }
  return out;
}

/** Robôs com problema (pro card de Alertas). */
export async function robosComProblema() {
  const { data } = await db().from("robos_status").select("*").in("status", ["atencao", "fora"]).order("status", { ascending: false });
  return (data ?? []) as (Linha & { grupo: string })[];
}

export async function todosOsRobos() {
  const { data } = await db().from("robos_status").select("*").order("grupo").order("nome");
  return (data ?? []) as (Linha & { grupo: string; ultima_tentativa: string | null })[];
}
