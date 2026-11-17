import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { MAURICIO } from "@/lib/rotina-relatorio/dia";

// 17/11/2026 (pedido do Maurício no grupo "Sistemas e IA"): quando sai a revista
// do INPI (terça) e algum processo da carteira tem despacho, a equipe recebe no
// WhatsApp, no modelo do Astrea:
//  - uma mensagem por processo ("Atualização de processo ... RPI X de dd/mm/aaaa. Despacho.")
//  - um "Resumo de despachos RPI X" com todos os processos dela.
// Recebem: o Maurício (tudo) e o responsável da equipe de cada marca (só as dele).
// Responsável = campo "Responsável na equipe" da marca; sem ele, quem cadastrou a marca.
// Nada vai para cliente. Uma vez por revista (origem_ref marca-rpi:<n>:...).

const db = () => createAdminClient() as unknown as SupabaseClient;
const MAX_INDIVIDUAIS = 10; // acima disso a pessoa recebe só o resumo
const br = (d: string) => d.split("-").reverse().join("/");

type Item = { processo: string; nome: string; despacho: string };

export async function avisarEquipeDaRevista(numero: number): Promise<{ pessoas: number; mensagens: number } | { pulado: string }> {
  const banco = db();
  const { count } = await banco.from("wa_jobs").select("id", { count: "exact", head: true }).like("origem_ref", `marca-rpi:${numero}:%`);
  if (count) return { pulado: "já avisado" };

  const { data: rev } = await banco.from("rpi_revistas").select("data, processada_em").eq("numero", numero).maybeSingle();
  if (!rev?.processada_em) return { pulado: "revista ainda não lida" };
  // revista antiga (ex.: primeira vez que isto roda) não dispara aviso atrasado
  if (Date.now() - Date.parse(`${rev.data}T12:00:00-03:00`) > 7 * 86_400_000) return { pulado: "revista com mais de 7 dias" };
  const { data: pubs } = await banco.from("marca_publicacoes").select("marca_id, despacho").eq("rpi", numero);
  if (!pubs?.length) return { pulado: "sem despachos da carteira" };

  const ids = [...new Set(pubs.map((p) => p.marca_id as string))];
  let marcas: Record<string, unknown>[] | null = null;
  {
    const r = await banco.from("marcas").select("id, processo, nome, apelido, tipo, responsavel_id, criado_por").in("id", ids);
    // sem a migration 0078 ainda: segue só com quem cadastrou
    marcas = r.error ? (await banco.from("marcas").select("id, processo, nome, apelido, tipo, criado_por").in("id", ids)).data : r.data;
  }
  const { data: equipe } = await banco.from("responsaveis").select("id, nome, telefone, profile_id");
  const pessoaPorId = new Map((equipe ?? []).map((p) => [p.id as string, p]));
  const pessoaPorPerfil = new Map((equipe ?? []).filter((p) => p.profile_id).map((p) => [p.profile_id as string, p]));
  const mauricio = pessoaPorPerfil.get(MAURICIO);

  // itens por pessoa (id do responsável)
  const porPessoa = new Map<string, Item[]>();
  const add = (pid: string | undefined, it: Item) => {
    if (!pid) return;
    const l = porPessoa.get(pid) ?? [];
    if (!l.some((x) => x.processo === it.processo)) l.push(it);
    porPessoa.set(pid, l);
  };
  for (const m of marcas ?? []) {
    const despachos = pubs.filter((p) => p.marca_id === m.id).map((p) => p.despacho as string);
    const it: Item = {
      processo: m.processo as string,
      nome: String(m.nome ?? m.apelido ?? "sem nome"),
      despacho: [...new Set(despachos)].join("; "),
    };
    add(mauricio?.id as string | undefined, it);
    const resp = (m.responsavel_id as string | null) ?? (m.criado_por ? (pessoaPorPerfil.get(m.criado_por as string)?.id as string | undefined) : undefined);
    if (resp && resp !== mauricio?.id) add(resp, it);
  }

  const data = br(String(rev?.data ?? ""));
  let mensagens = 0;
  let pessoas = 0;
  for (const [pid, itens] of porPessoa) {
    const p = pessoaPorId.get(pid);
    let tel = String(p?.telefone ?? "").replace(/\D/g, "");
    if (!p || tel.length < 10) continue;
    if (tel.length <= 11) tel = `55${tel}`;
    pessoas++;
    const primeiro = String(p.nome).replace(/^(Dra?\.)\s*/i, "").split(" ")[0];
    const fila = (texto: string, ref: string) =>
      enfileirarMensagem({ para: tel, texto, origemRef: `marca-rpi:${numero}:${ref}:${pid}`, expiraEm: new Date(Date.now() + 2 * 86_400_000) }).then((ok) => ok && mensagens++);
    if (itens.length <= MAX_INDIVIDUAIS) {
      for (const it of itens) {
        await fila(
          `*Atualização de processo*\nOlá ${primeiro},\nEsta é uma notificação automática sobre uma atualização publicada pelo INPI para o processo ${it.processo}: marca "${it.nome}" (${it.processo}), RPI ${numero} de ${data}. ${it.despacho}.\n\nConsulte o processo: mcadvogados.app.br/admin/marcas/processos/${it.processo}`,
          it.processo
        );
      }
    }
    const linhas = itens.map((it, i) => `[${i + 1}] Marca: ${it.nome} (${it.processo}) - Despacho: ${it.despacho}`).join("\n");
    await fila(`*Resumo de despachos RPI ${numero} de ${data}*\n\n${linhas}\n\nMarcas no portal: mcadvogados.app.br/admin/marcas`, "resumo");
  }
  return { pessoas, mensagens };
}
