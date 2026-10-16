import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEscritorioConfig, listPessoas } from "@/lib/data/escritorio";
import { diaDaPessoa, textoDaRotina } from "@/lib/data/rotina";
import { ehDiaDeExpediente } from "@/lib/publicacoes/sugestoes";
import { enfileirarMensagem } from "@/lib/zap/fila";

// Rotina das 7h: para cada pessoa com WhatsApp e "rotina no Zap" ligada, monta
// a agenda do dia e deixa na fila para sair às 07:00 (Bahia). Só em dia de
// expediente e uma vez por dia (tabela rotina_envios).

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br";

export type ResultadoRotina = { dia: string; enfileiradas: number; puladas: number; motivo?: string; erro?: string };

export async function enfileirarRotinas({ forcar = false, so }: { forcar?: boolean; so?: string } = {}): Promise<ResultadoRotina> {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const r: ResultadoRotina = { dia, enfileiradas: 0, puladas: 0 };
  const config = await getEscritorioConfig();
  if (!config.rotina_ativa && !forcar) return { ...r, motivo: "rotina desligada" };
  if (!ehDiaDeExpediente(dia) && !forcar) return { ...r, motivo: "não é dia de expediente" };

  const db = createAdminClient();
  const pessoas = (await listPessoas()).filter((p) => p.telefone && p.rotinaZap && (!so || p.id === so));
  const { data: feitas } = await db.from("rotina_envios").select("responsavel_id").eq("dia", dia);
  const jaFoi = new Set((feitas ?? []).map((f) => f.responsavel_id));

  // sai às 07:00; se já passou (rodou atrasado), sai na hora
  const seteHoras = new Date(`${dia}T07:00:00-03:00`);
  const quando = seteHoras.getTime() > Date.now() ? seteHoras : null;

  for (const p of pessoas) {
    if (jaFoi.has(p.id) && !forcar) {
      r.puladas++;
      continue;
    }
    try {
      const texto = textoDaRotina(p.nome, dia, await diaDaPessoa(p.id, dia), `${SITE}/admin/agenda`);
      // marca antes de enfileirar: duas execuções ao mesmo tempo não duplicam
      const { error: dup } = await db.from("rotina_envios").insert({ responsavel_id: p.id, dia });
      if (dup && !forcar) {
        r.puladas++;
        continue;
      }
      const jobId = await enfileirarMensagem({ para: p.telefone!, texto, agendadoPara: quando, expiraEm: new Date(`${dia}T${forcar ? "23:59" : "12:00"}:00-03:00`), origemRef: `rotina:${p.id}:${dia}` });
      if (jobId) await db.from("rotina_envios").update({ job_id: jobId }).eq("responsavel_id", p.id).eq("dia", dia);
      r.enfileiradas++;
    } catch (e) {
      r.erro = e instanceof Error ? e.message : String(e);
    }
  }
  return r;
}
