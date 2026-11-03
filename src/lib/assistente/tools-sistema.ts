import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { PERMISSOES } from "@/lib/permissoes";
import { PROCESS_AREAS } from "@/lib/process-area";
import { cumprimento, listarItensRotina, relatorioDoDia, rotinaDoDia } from "@/lib/data/rotina-diaria";
import { descreverRepeticao, regraValida } from "@/lib/rotina-repeticao";
import { conversaCom, GERAL } from "@/lib/data/mensagens";
import { hojeBahia, somaDias } from "@/lib/periodo";
import { MOTIVO_TEXTO, todosOsRobos, type MotivoFalha } from "@/lib/robos/saude";
import type { Ctx, ToolDef } from "./tools";

// Ferramentas do assistente para o que entrou no portal em out/2026: rotinas,
// etiquetas, envolvidos, equipe (papel, permissões, clientes), processos e
// mensagens internas. Regra do usuário: tudo o que existe na tela o
// assistente também opera (feedback_assistente_acompanha_sistema).

type Db = SupabaseClient<Database>;
const solto = (d: Db) => d as unknown as SupabaseClient; // tabelas fora do types.ts gerado
const adm = () => createAdminClient();
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const limpa = (s: unknown) => String(s ?? "").replace(/[,()%*\\]/g, " ").trim();
const HORA = /^\d{2}:\d{2}$/;
const DATA = { type: "string", description: "AAAA-MM-DD" };

/* ───────── pessoas, clientes, etiquetas pelo nome ───────── */

type Pessoa = { id: string; nome: string; profile_id: string | null };

export async function pessoaPorNome(alvo: unknown): Promise<Pessoa> {
  const t = limpa(alvo);
  if (!t) throw new Error("Diga de quem (nome da pessoa da equipe).");
  const { data } = await adm().from("responsaveis").select("id, nome, profile_id, email").or(`nome.ilike.%${t}%,email.ilike.%${t}%`).limit(6);
  if (!data?.length) throw new Error(`Não achei "${t}" na equipe.`);
  const comLogin = data.filter((r) => r.profile_id);
  const exato = data.find((r) => r.nome.toLowerCase() === t.toLowerCase()) ?? (comLogin.length === 1 ? comLogin[0] : undefined);
  if (!exato && data.length > 1) throw new Error(`Há mais de uma pessoa parecida com "${t}": ${data.map((r) => r.nome).join(", ")}. Diga qual.`);
  const p = exato ?? data[0];
  return { id: p.id, nome: p.nome, profile_id: p.profile_id };
}

async function meuResponsavel(ctx: Ctx): Promise<Pessoa> {
  const { data } = await adm().from("responsaveis").select("id, nome, profile_id").eq("profile_id", ctx.profileId).maybeSingle();
  if (!data) throw new Error("Você não está na lista de pessoas da equipe.");
  return data;
}

/** "você", vazio ou "eu" = quem está usando; senão a pessoa pelo nome. */
const quem = (alvo: unknown, ctx: Ctx) => (!limpa(alvo) || /^(eu|você|voce|me|mim|minha)$/i.test(limpa(alvo)) ? meuResponsavel(ctx) : pessoaPorNome(alvo));

/** Envolvidos pelo nome → ids de responsaveis. */
export async function envolvidosPorNome(nomes: unknown): Promise<string[]> {
  const lista = (Array.isArray(nomes) ? nomes : String(nomes ?? "").split(/[,;]/)).map((n) => String(n).trim()).filter(Boolean);
  const ids: string[] = [];
  for (const n of lista) ids.push((await pessoaPorNome(n)).id);
  return [...new Set(ids)];
}

/** Etiquetas pelo nome → ids (cria as que não existem, se `criar`). */
export async function etiquetasPorNome(nomes: unknown, criar = true): Promise<string[]> {
  const lista = (Array.isArray(nomes) ? nomes : String(nomes ?? "").split(/[,;]/)).map((n) => String(n).trim()).filter(Boolean);
  const db = solto(adm());
  const ids: string[] = [];
  for (const n of lista) {
    const { data } = await db.from("etiquetas").select("id, nome").ilike("nome", n).maybeSingle();
    if (data) ids.push(data.id);
    else if (criar) {
      const { data: nova, error } = await db.from("etiquetas").insert({ nome: n.slice(0, 60) }).select("id").single();
      if (error || !nova) throw new Error(`Não consegui criar a etiqueta "${n}".`);
      ids.push(nova.id);
    } else throw new Error(`Não existe a etiqueta "${n}".`);
  }
  return [...new Set(ids)];
}

async function clientePorNome(alvo: unknown): Promise<{ id: string; name: string }> {
  const t = limpa(alvo);
  if (/^[0-9a-f-]{36}$/i.test(t)) {
    const { data } = await adm().from("clients").select("id, name").eq("id", t).maybeSingle();
    if (data) return data;
  }
  const { data } = await adm().from("clients").select("id, name").ilike("name", `%${t}%`).limit(5);
  if (!data?.length) throw new Error(`Não achei o cliente "${t}".`);
  const exato = data.find((c) => c.name.toLowerCase() === t.toLowerCase());
  if (!exato && data.length > 1) throw new Error(`Há mais de um cliente parecido com "${t}": ${data.map((c) => c.name).join(", ")}. Diga qual.`);
  return exato ?? data[0];
}

/* ───────── dias da semana ───────── */

const NOME_DIA: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, sáb: 6 };
const ROTULO_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function lerDias(v: unknown): number[] | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const txt = (Array.isArray(v) ? v.join(",") : String(v)).toLowerCase();
  if (/todos|todo dia|diari/.test(txt)) return [0, 1, 2, 3, 4, 5, 6];
  if (/uteis|úteis|seg.*sex/.test(txt) && !/,/.test(txt)) return [1, 2, 3, 4, 5];
  const out = new Set<number>();
  for (const parte of txt.split(/[,;\s]+/)) {
    const n = Number(parte);
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
    else {
      const k = Object.keys(NOME_DIA).find((d) => parte.normalize("NFD").replace(/[̀-ͯ]/g, "").startsWith(d.normalize("NFD").replace(/[̀-ͯ]/g, "")));
      if (k) out.add(NOME_DIA[k]);
    }
  }
  return out.size ? [...out].sort() : undefined;
}
const hora = (v: unknown) => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (!HORA.test(t)) throw new Error(`Horário inválido: "${t}" (use HH:MM).`);
  return t;
};
const DIAS_PARAM = { type: "string", description: "Dias: 'seg a sex' (padrão), 'todos os dias' ou lista como 'seg, qua, sex'" };

/* ───────── ferramentas ───────── */

export function toolsSistema(db: () => Db): ToolDef[] {
  return [
    {
      name: "saude_robos",
      kind: "read",
      label: "Conferiu a saúde dos robôs",
      description: "Situação de cada robô automático (publicações do DJEN, andamentos, agente do WhatsApp, robôs dos tribunais): funcionando, com falha ou fora do ar, desde quando, motivo e última leitura com sucesso. Use quando perguntarem se os robôs/automações estão funcionando.",
      parameters: obj({}),
      run: async () => {
        const robos = await todosOsRobos();
        const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia" }) : "nunca");
        return {
          resumo: robos.length ? `${robos.filter((r) => r.status === "ok").length} de ${robos.length} funcionando` : "nenhum robô registrou rodada ainda",
          robos: robos.map((r) => ({
            robo: r.nome,
            situacao: { ok: "funcionando", atencao: "com falha (tentando de novo)", fora: "FORA DO AR", pausado: "pausado" }[r.status],
            desde: hora(r.desde),
            motivo: r.status === "ok" ? null : (MOTIVO_TEXTO[r.motivo as MotivoFalha] ?? r.motivo),
            detalhe: r.status === "ok" ? null : r.detalhe,
            ultima_leitura_ok: hora(r.ultima_ok),
          })),
          link_no_portal: "/admin/alertas?aba=robos",
        };
      },
    },
    // ───────── ROTINAS ─────────
    {
      name: "rotina_do_dia",
      kind: "read",
      label: "Consultou a rotina",
      description: "Rotina diária de uma pessoa num dia (itens com horário, o que já foi feito, atrasados). pessoa vazia = quem está usando.",
      parameters: obj({ pessoa: { type: "string" }, dia: DATA }),
      run: async (a, ctx) => {
        const p = await quem(a.pessoa, ctx);
        const dia = a.dia ? String(a.dia) : hojeBahia();
        const itens = await rotinaDoDia(p.id, dia, solto(db()));
        return {
          pessoa: p.nome,
          dia,
          itens: itens.map((i) => ({
            item_id: i.id,
            titulo: i.titulo,
            horario: i.hora_inicio ? `${i.hora_inicio.slice(0, 5)}${i.hora_fim ? `–${i.hora_fim.slice(0, 5)}` : ""}` : null,
            situacao: i.situacao,
            feito_em: i.feitoEm,
            como_fazer: i.observacao,
          })),
          link_no_portal: "/admin/rotinas",
        };
      },
    },
    {
      name: "marcar_rotina",
      kind: "write",
      label: "Marcou item da rotina",
      description: "Marca (feito=true) ou desmarca (feito=false) um item da rotina de HOJE. Informe item_id (de rotina_do_dia) ou o título. Cada um só marca a própria rotina (o admin máximo pode marcar a de qualquer um).",
      parameters: obj({ item_id: { type: "string" }, titulo: { type: "string" }, feito: { type: "boolean" }, pessoa: { type: "string" } }, ["feito"]),
      run: async (a, ctx) => {
        const p = await quem(a.pessoa, ctx);
        if (p.profile_id !== ctx.profileId && !ctx.superAdmin) throw new Error("Só a própria pessoa marca a rotina dela.");
        const dia = hojeBahia();
        const itens = await rotinaDoDia(p.id, dia, solto(db()));
        const alvo = a.item_id ? itens.find((i) => i.id === a.item_id) : itens.find((i) => i.titulo.toLowerCase().includes(limpa(a.titulo).toLowerCase()));
        if (!alvo) throw new Error("Não achei esse item na rotina de hoje.");
        const d = solto(adm());
        if (a.feito) await d.from("rotina_feitos").upsert({ item_id: alvo.id, responsavel_id: p.id, dia }, { onConflict: "item_id,dia" });
        else await d.from("rotina_feitos").delete().eq("item_id", alvo.id).eq("dia", dia);
        return { item: alvo.titulo, feito: !!a.feito, pessoa: p.nome };
      },
    },
    {
      name: "listar_rotinas",
      kind: "read",
      label: "Consultou as rotinas",
      description: "Itens da rotina de uma pessoa ou de todas, na ordem de prioridade: título, horário, repetição (dias da semana ou regra do mês), checklist, como fazer.",
      parameters: obj({ pessoa: { type: "string" } }),
      run: async (a) => {
        const p = a.pessoa ? await pessoaPorNome(a.pessoa) : null;
        const itens = await listarItensRotina(p ? [p.id] : undefined, solto(adm()));
        const { data: pessoas } = await adm().from("responsaveis").select("id, nome");
        const nome = new Map((pessoas ?? []).map((x) => [x.id, x.nome]));
        const posicao = new Map<string, number>();
        return itens.map((i) => {
          const n = (posicao.get(i.responsavel_id) ?? 0) + 1;
          posicao.set(i.responsavel_id, n);
          return {
            item_id: i.id,
            pessoa: nome.get(i.responsavel_id),
            prioridade: n,
            titulo: i.titulo,
            inicio: i.hora_inicio?.slice(0, 5) ?? null,
            fim: i.hora_fim?.slice(0, 5) ?? null,
            repete: i.repeticao === "mensal" ? descreverRepeticao(i) : i.dias.map((d) => ROTULO_DIA[d]).join(", "),
            checklist: i.checklist.map((c) => c.texto),
            como_fazer: i.observacao,
          };
        });
      },
    },
    {
      name: "criar_item_rotina",
      kind: "write",
      soSuper: true,
      label: "Criou item de rotina",
      description: "Adiciona um item à rotina diária de uma pessoa (só o admin máximo). inicio/fim em HH:MM (opcionais).",
      parameters: obj({ pessoa: { type: "string" }, titulo: { type: "string" }, inicio: { type: "string" }, fim: { type: "string" }, dias: DIAS_PARAM, como_fazer: { type: "string" } }, ["pessoa", "titulo"]),
      run: async (a) => {
        const p = await pessoaPorNome(a.pessoa);
        const ini = hora(a.inicio);
        const fim = hora(a.fim);
        if (fim && (!ini || fim <= ini)) throw new Error("O fim precisa ser depois do início.");
        const d = solto(adm());
        const { count } = await d.from("rotina_itens").select("id", { count: "exact", head: true }).eq("responsavel_id", p.id);
        const { data, error } = await d
          .from("rotina_itens")
          .insert({ responsavel_id: p.id, titulo: String(a.titulo).slice(0, 140), dias: lerDias(a.dias) ?? [1, 2, 3, 4, 5], hora_inicio: ini, hora_fim: fim, observacao: a.como_fazer ? String(a.como_fazer).slice(0, 1000) : null, ordem: count ?? 0 })
          .select("id")
          .single();
        if (error) throw error;
        return { item_id: data.id, pessoa: p.nome, link_no_portal: `/admin/rotinas?pessoa=${p.id}` };
      },
    },
    {
      name: "editar_item_rotina",
      kind: "write",
      soSuper: true,
      label: "Alterou item de rotina",
      description:
        "Altera um item da rotina (só o que muda): titulo, inicio, fim, dias, como_fazer; repeticao 'semanal' (usa dias) ou 'mensal' com regra_mensal ({tipo:'dia',dia:5} | {tipo:'util',qual:'primeiro'|'ultimo'} | {tipo:'semana',ordem:1-4 ou -1,dia_semana:0-6}); checklist (lista de subitens, substitui a atual; [] tira); prioridade (posição na lista da pessoa, 1 = topo). Pegue o item_id em listar_rotinas.",
      parameters: obj(
        {
          item_id: { type: "string" },
          titulo: { type: "string" },
          inicio: { type: "string" },
          fim: { type: "string" },
          dias: DIAS_PARAM,
          como_fazer: { type: "string" },
          repeticao: { type: "string", enum: ["semanal", "mensal"] },
          regra_mensal: { type: "object", description: "regra do mês quando repeticao = mensal", properties: { tipo: { type: "string", enum: ["dia", "util", "semana"] }, dia: { type: "number" }, qual: { type: "string", enum: ["primeiro", "ultimo"] }, ordem: { type: "number" }, dia_semana: { type: "number" } } },
          checklist: { type: "array", items: { type: "string" } },
          prioridade: { type: "number", description: "1 = primeiro da lista" },
        },
        ["item_id"]
      ),
      run: async (a) => {
        const patch: Record<string, unknown> = {};
        if (a.repeticao === "mensal") {
          const r = regraValida(a.regra_mensal);
          if (!r) throw new Error("Para repetir por mês, diga a regra (ex.: todo dia 5, 1º dia útil, última sexta).");
          patch.repeticao = "mensal";
          patch.regra_mensal = r;
        } else if (a.repeticao === "semanal") {
          patch.repeticao = "semanal";
          patch.regra_mensal = null;
        }
        if (Array.isArray(a.checklist)) {
          const { data: atual } = await solto(adm()).from("rotina_itens").select("checklist").eq("id", String(a.item_id)).maybeSingle();
          const antigos = ((atual?.checklist ?? []) as { id: string; texto: string }[]);
          // mantém o id do subitem que continua igual (o que já foi marcado hoje não se perde)
          patch.checklist = (a.checklist as unknown[])
            .map((t) => String(t).trim().slice(0, 200))
            .filter(Boolean)
            .slice(0, 30)
            .map((texto) => ({ id: antigos.find((x) => x.texto === texto)?.id ?? crypto.randomUUID(), texto }));
        }
        if (typeof a.prioridade === "number") {
          const d = solto(adm());
          const { data: it } = await d.from("rotina_itens").select("responsavel_id").eq("id", String(a.item_id)).maybeSingle();
          if (!it) throw new Error("Item não encontrado.");
          const { data: lista } = await d.from("rotina_itens").select("id").eq("responsavel_id", it.responsavel_id).eq("ativo", true).order("ordem").order("created_at");
          const ids = (lista ?? []).map((x) => x.id as string).filter((x) => x !== String(a.item_id));
          ids.splice(Math.max(0, Math.min(ids.length, Math.round(a.prioridade) - 1)), 0, String(a.item_id));
          await Promise.all(ids.map((x, n) => d.from("rotina_itens").update({ ordem: n }).eq("id", x)));
          if (Object.keys(patch).length === 0 && a.titulo === undefined && a.inicio === undefined && a.fim === undefined && a.dias === undefined && a.como_fazer === undefined) return { ok: true, prioridade: ids.indexOf(String(a.item_id)) + 1 };
        }
        if (a.titulo !== undefined) patch.titulo = String(a.titulo).slice(0, 140);
        if (a.inicio !== undefined) patch.hora_inicio = hora(a.inicio);
        if (a.fim !== undefined) patch.hora_fim = hora(a.fim);
        const dias = lerDias(a.dias);
        if (dias) patch.dias = dias;
        if (a.como_fazer !== undefined) patch.observacao = String(a.como_fazer).trim() || null;
        if (!Object.keys(patch).length) throw new Error("Nada para alterar.");
        const { data, error } = await solto(adm()).from("rotina_itens").update(patch).eq("id", String(a.item_id)).select("titulo").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Item não encontrado.");
        return { ok: true, item: data.titulo };
      },
    },
    {
      name: "excluir_item_rotina",
      kind: "delete",
      soSuper: true,
      label: "Tirou item da rotina",
      description: "Tira um item da rotina (os pontos já ganhos com ele continuam).",
      parameters: obj({ item_id: { type: "string" } }, ["item_id"]),
      descrever: async (a) => {
        const { data } = await solto(adm()).from("rotina_itens").select("titulo, responsaveis(nome)").eq("id", String(a.item_id)).maybeSingle();
        return data ? `Tirar "${data.titulo}" da rotina de ${(data.responsaveis as unknown as { nome: string } | null)?.nome ?? "?"}` : "Item da rotina";
      },
      run: async (a) => {
        const { error } = await solto(adm()).from("rotina_itens").update({ ativo: false }).eq("id", String(a.item_id));
        if (error) throw error;
        return { ok: true };
      },
    },
    {
      name: "copiar_rotina",
      kind: "write",
      soSuper: true,
      label: "Copiou rotina",
      description: "Copia todos os itens da rotina de uma pessoa (de) para outra (para), somando aos que ela já tem.",
      parameters: obj({ de: { type: "string" }, para: { type: "string" } }, ["de", "para"]),
      run: async (a) => {
        const [de, para] = await Promise.all([pessoaPorNome(a.de), pessoaPorNome(a.para)]);
        const d = solto(adm());
        const { data: itens } = await d.from("rotina_itens").select("titulo, dias, hora_inicio, hora_fim, observacao, ordem").eq("responsavel_id", de.id).eq("ativo", true);
        if (!itens?.length) throw new Error(`${de.nome} não tem rotina.`);
        const { error } = await d.from("rotina_itens").insert(itens.map((i) => ({ ...i, responsavel_id: para.id })));
        if (error) throw error;
        return { copiados: itens.length, de: de.nome, para: para.nome };
      },
    },
    {
      name: "relatorio_rotina",
      kind: "read",
      label: "Consultou o cumprimento das rotinas",
      description: "O que cada pessoa fez e não fez da rotina num dia (padrão hoje) + % de cumprimento em 7 e 30 dias. Use para 'quem fez a rotina hoje?', 'fulano está cumprindo?'.",
      parameters: obj({ dia: DATA, pessoa: { type: "string" } }),
      run: async (a, ctx) => {
        if (!ctx.superAdmin && ctx.role !== "admin") throw new Error("Só o administrador consulta o que cada um fez da rotina.");
        const hoje = hojeBahia();
        const dia = a.dia ? String(a.dia) : hoje;
        const d = solto(adm());
        const [rel, c7, c30, { data: pessoas }] = await Promise.all([relatorioDoDia(dia, d), cumprimento(somaDias(hoje, -6), hoje, d), cumprimento(somaDias(hoje, -29), hoje, d), adm().from("responsaveis").select("id, nome")]);
        const filtro = a.pessoa ? (await pessoaPorNome(a.pessoa)).id : null;
        const pct = (x?: { feitos: number; esperados: number }) => (x?.esperados ? `${Math.round((x.feitos / x.esperados) * 100)}%` : null);
        return (pessoas ?? [])
          .filter((p) => (!filtro || p.id === filtro) && (rel.has(p.id) || c30.get(p.id)?.esperados))
          .map((p) => ({
            pessoa: p.nome,
            dia,
            itens: (rel.get(p.id) ?? []).map((l) => ({
              titulo: l.item.titulo,
              horario: l.item.hora_inicio?.slice(0, 5) ?? null,
              status: l.feitoEm ? (l.noHorario ? "feito no horário" : "feito com atraso") : l.passou ? "não fez" : "ainda não",
            })),
            cumprimento_7_dias: pct(c7.get(p.id)),
            cumprimento_30_dias: pct(c30.get(p.id)),
          }));
      },
    },

    // ───────── ETIQUETAS ─────────
    {
      name: "listar_etiquetas",
      kind: "read",
      perm: ["atividades"],
      label: "Consultou as etiquetas",
      description: "Etiquetas do escritório (nome e cor).",
      parameters: obj({}),
      run: async () => {
        const { data } = await solto(adm()).from("etiquetas").select("id, nome, cor").order("nome");
        return data ?? [];
      },
    },
    {
      name: "criar_etiqueta",
      kind: "write",
      perm: ["atividades"],
      label: "Criou etiqueta",
      description: "Cria uma etiqueta (cor opcional em #RRGGBB).",
      parameters: obj({ nome: { type: "string" }, cor: { type: "string" } }, ["nome"]),
      run: async (a) => {
        const nome = String(a.nome).trim().slice(0, 60);
        const cor = /^#[0-9a-f]{6}$/i.test(String(a.cor ?? "")) ? String(a.cor) : undefined;
        const { data, error } = await solto(adm()).from("etiquetas").insert({ nome, ...(cor ? { cor } : {}) }).select("id, nome, cor").single();
        if (error) throw new Error(error.code === "23505" ? "Já existe essa etiqueta." : error.message);
        return data;
      },
    },
    {
      name: "editar_etiqueta",
      kind: "write",
      perm: ["atividades"],
      label: "Alterou etiqueta",
      description: "Renomeia e/ou troca a cor (#RRGGBB) de uma etiqueta.",
      parameters: obj({ etiqueta: { type: "string", description: "nome atual" }, novo_nome: { type: "string" }, cor: { type: "string" } }, ["etiqueta"]),
      run: async (a) => {
        const [id] = await etiquetasPorNome([a.etiqueta], false);
        const patch: Record<string, unknown> = {};
        if (a.novo_nome) patch.nome = String(a.novo_nome).trim().slice(0, 60);
        if (/^#[0-9a-f]{6}$/i.test(String(a.cor ?? ""))) patch.cor = String(a.cor);
        if (!Object.keys(patch).length) throw new Error("Nada para alterar.");
        const { error } = await solto(adm()).from("etiquetas").update(patch).eq("id", id);
        if (error) throw error;
        return { ok: true };
      },
    },
    {
      name: "excluir_etiqueta",
      kind: "delete",
      perm: ["atividades", "excluir"],
      label: "Excluiu etiqueta",
      description: "Exclui uma etiqueta e tira ela de todas as atividades.",
      parameters: obj({ etiqueta: { type: "string" } }, ["etiqueta"]),
      descrever: async (a) => `Excluir a etiqueta "${a.etiqueta}" (sai de todas as atividades)`,
      run: async (a) => {
        const [id] = await etiquetasPorNome([a.etiqueta], false);
        const d = solto(adm());
        const { data: usando } = await d.from("activities").select("id, etiquetas").contains("etiquetas", [id]);
        for (const x of usando ?? []) await d.from("activities").update({ etiquetas: (x.etiquetas ?? []).filter((e: string) => e !== id) }).eq("id", x.id);
        await d.from("etiquetas").delete().eq("id", id);
        return { ok: true, tirada_de: usando?.length ?? 0 };
      },
    },
    {
      name: "etiquetar_atividade",
      kind: "write",
      perm: ["atividades"],
      label: "Mudou etiquetas da atividade",
      description: "Põe e/ou tira etiquetas de uma atividade (pelos nomes). Etiqueta que não existe é criada.",
      parameters: obj({ activity_id: { type: "string" }, colocar: { type: "array", items: { type: "string" } }, tirar: { type: "array", items: { type: "string" } } }, ["activity_id"]),
      run: async (a) => {
        const { data: at } = await db().from("activities").select("id, title, etiquetas").eq("id", String(a.activity_id)).maybeSingle();
        if (!at) throw new Error("Atividade não encontrada.");
        const por = await etiquetasPorNome(a.colocar ?? [], true);
        const tira = await etiquetasPorNome(a.tirar ?? [], false).catch(() => [] as string[]);
        const atual = new Set([...(at.etiquetas ?? []), ...por]);
        for (const t of tira) atual.delete(t);
        const { error } = await db().from("activities").update({ etiquetas: [...atual] }).eq("id", at.id);
        if (error) throw error;
        return { atividade: at.title, etiquetas: atual.size };
      },
    },

    // ───────── EQUIPE ─────────
    {
      name: "listar_equipe",
      kind: "read",
      perm: ["equipe"],
      label: "Consultou a equipe",
      description: "Pessoas da equipe com papel (admin/advogado), se é admin máximo, se está ativa, clientes que cuida e o que está bloqueado para ela.",
      parameters: obj({}),
      run: async () => {
        const d = adm();
        const [{ data: perfis }, { data: desig }, { data: perms }, { data: clientes }] = await Promise.all([
          d.from("profiles").select("id, full_name, email, role, ativo, oculto, super_admin").in("role", ["admin", "advogado"]).eq("oculto", false),
          d.from("equipe_clientes").select("profile_id, client_id"),
          d.from("equipe_permissoes").select("profile_id, permissoes"),
          d.from("clients").select("id, name"),
        ]);
        const nomeCli = new Map((clientes ?? []).map((c) => [c.id, c.name]));
        return (perfis ?? []).map((p) => {
          const salvas = ((perms ?? []).find((x) => x.profile_id === p.id)?.permissoes ?? {}) as Record<string, boolean>;
          const bloqueadas = p.super_admin ? [] : PERMISSOES.filter((k) => (k.chave in salvas ? !salvas[k.chave] : p.role === "advogado" && !k.padrao)).map((k) => k.chave);
          return {
            nome: p.full_name,
            email: p.email,
            papel: p.super_admin ? "admin máximo" : p.role,
            ativo: p.ativo,
            clientes: (desig ?? []).filter((x) => x.profile_id === p.id).map((x) => nomeCli.get(x.client_id)),
            bloqueado: bloqueadas,
          };
        });
      },
    },
    {
      name: "definir_permissoes",
      kind: "write",
      soSuper: true,
      label: "Mudou permissões",
      description: `Liga e/ou desliga permissões de uma pessoa (não vale para admin máximo). Chaves: ${PERMISSOES.map((p) => `${p.chave} (${p.rotulo})`).join("; ")}.`,
      parameters: obj({ pessoa: { type: "string" }, ligar: { type: "array", items: { type: "string" } }, desligar: { type: "array", items: { type: "string" } } }, ["pessoa"]),
      run: async (a) => {
        const prof = await perfilDaPessoa(a.pessoa);
        const chaves = new Set<string>(PERMISSOES.map((p) => p.chave));
        const d = adm();
        const { data: atual } = await d.from("equipe_permissoes").select("permissoes").eq("profile_id", prof.id).maybeSingle();
        const base = Object.fromEntries(PERMISSOES.map((p) => [p.chave, prof.role === "admin" ? true : p.padrao])) as Record<string, boolean>;
        const novo = { ...base, ...((atual?.permissoes ?? {}) as Record<string, boolean>) };
        const invalidas: string[] = [];
        for (const k of (a.ligar as string[]) ?? []) if (chaves.has(k)) novo[k] = true; else invalidas.push(k);
        for (const k of (a.desligar as string[]) ?? []) if (chaves.has(k)) novo[k] = false; else invalidas.push(k);
        if (invalidas.length) throw new Error(`Permissões desconhecidas: ${invalidas.join(", ")}.`);
        const { error } = await d.from("equipe_permissoes").upsert({ profile_id: prof.id, permissoes: novo, updated_at: new Date().toISOString() });
        if (error) throw error;
        return { pessoa: prof.full_name, ligadas: a.ligar ?? [], desligadas: a.desligar ?? [] };
      },
    },
    {
      name: "definir_clientes_da_pessoa",
      kind: "write",
      soSuper: true,
      label: "Mudou os clientes de alguém",
      description: "Define quais clientes uma pessoa cuida. Cada cliente fica com UMA pessoa só: ao dar um cliente a alguém, ele sai de quem estava. modo: adicionar | remover | substituir (troca a lista inteira).",
      parameters: obj({ pessoa: { type: "string" }, clientes: { type: "array", items: { type: "string" } }, modo: { type: "string", enum: ["adicionar", "remover", "substituir"] } }, ["pessoa", "clientes"]),
      run: async (a) => {
        const prof = await perfilDaPessoa(a.pessoa);
        const ids: string[] = [];
        for (const c of (a.clientes as string[]) ?? []) ids.push((await clientePorNome(c)).id);
        const d = adm();
        const modo = String(a.modo ?? "adicionar");
        if (modo === "substituir") await d.from("equipe_clientes").delete().eq("profile_id", prof.id);
        if (modo === "remover") {
          if (ids.length) await d.from("equipe_clientes").delete().eq("profile_id", prof.id).in("client_id", ids);
        } else if (ids.length) {
          await d.from("equipe_clientes").delete().in("client_id", ids).neq("profile_id", prof.id); // exclusivo
          await d.from("equipe_clientes").upsert(ids.map((client_id) => ({ profile_id: prof.id, client_id })), { onConflict: "profile_id,client_id" });
        }
        const { data } = await d.from("equipe_clientes").select("clients(name)").eq("profile_id", prof.id);
        return { pessoa: prof.full_name, clientes_agora: (data ?? []).map((x) => (x.clients as unknown as { name: string } | null)?.name) };
      },
    },
    {
      name: "trocar_papel",
      kind: "atencao",
      soSuper: true,
      label: "Trocou o papel de alguém",
      description: "Troca o papel de uma pessoa entre admin e advogado (não vale para admin máximo nem para quem está usando).",
      parameters: obj({ pessoa: { type: "string" }, papel: { type: "string", enum: ["admin", "advogado"] } }, ["pessoa", "papel"]),
      descrever: async (a) => `Trocar ${a.pessoa} para ${a.papel === "admin" ? "Administrador(a)" : "Advogado(a)"}`,
      run: async (a, ctx) => {
        const prof = await perfilDaPessoa(a.pessoa);
        if (prof.id === ctx.profileId) throw new Error("Você não pode trocar o seu próprio papel.");
        const { error } = await adm().from("profiles").update({ role: String(a.papel) as never }).eq("id", prof.id);
        if (error) throw error;
        return { pessoa: prof.full_name, papel: a.papel };
      },
    },
    {
      name: "ativar_desativar_pessoa",
      kind: "atencao",
      soSuper: true,
      label: "Mudou o acesso de alguém",
      description: "Desativa (ativo=false: não entra mais, nada é apagado) ou reativa o acesso de uma pessoa da equipe.",
      parameters: obj({ pessoa: { type: "string" }, ativo: { type: "boolean" } }, ["pessoa", "ativo"]),
      descrever: async (a) => `${a.ativo ? "Reativar" : "Desativar"} o acesso de ${a.pessoa}`,
      run: async (a, ctx) => {
        const prof = await perfilDaPessoa(a.pessoa);
        if (prof.id === ctx.profileId) throw new Error("Você não pode mudar o seu próprio acesso.");
        const { error } = await adm().from("profiles").update({ ativo: !!a.ativo }).eq("id", prof.id);
        if (error) throw error;
        return { pessoa: prof.full_name, ativo: !!a.ativo };
      },
    },

    // ───────── PROCESSOS ─────────
    {
      name: "criar_processo",
      kind: "write",
      perm: ["processos"],
      label: "Cadastrou processo",
      description: `Cadastra um processo de um cliente. area: ${PROCESS_AREAS.join(", ")}.`,
      parameters: obj({ cliente: { type: "string" }, numero: { type: "string" }, area: { type: "string", enum: PROCESS_AREAS }, vara: { type: "string" }, fase: { type: "string" }, status: { type: "string" } }, ["cliente", "numero", "area"]),
      run: async (a, ctx) => {
        const c = await clientePorNome(a.cliente);
        const { data, error } = await db()
          .from("processes")
          .insert({
            client_id: c.id,
            numero_processo: String(a.numero).trim(),
            area: String(a.area) as never,
            vara_tribunal: a.vara ? String(a.vara) : null,
            fase: a.fase ? String(a.fase) : null,
            status: a.status ? String(a.status) : "ativo",
            responsible_id: ctx.profileId,
          })
          .select("id")
          .single();
        if (error) throw error;
        return { cliente: c.name, link_no_portal: `/admin/processes/${data.id}` };
      },
    },
    {
      name: "atualizar_processo",
      kind: "write",
      perm: ["processos"],
      label: "Atualizou processo",
      description: "Altera um processo (só o que muda): fase, status, vara, area. Ache o processo pelo número.",
      parameters: obj({ numero: { type: "string" }, fase: { type: "string" }, status: { type: "string" }, vara: { type: "string" }, area: { type: "string", enum: PROCESS_AREAS } }, ["numero"]),
      run: async (a) => {
        const dig = String(a.numero).replace(/\D/g, "");
        const { data: p } = await db().from("processes").select("id, numero_processo").or(`numero_digitos.eq.${dig},numero_processo.ilike.%${limpa(a.numero)}%`).limit(2);
        if (!p?.length) throw new Error("Processo não encontrado.");
        if (p.length > 1) throw new Error("Mais de um processo com esse número; informe o número completo.");
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (a.fase !== undefined) patch.fase = String(a.fase) || null;
        if (a.status !== undefined) patch.status = String(a.status);
        if (a.vara !== undefined) patch.vara_tribunal = String(a.vara) || null;
        if (a.area !== undefined) patch.area = String(a.area);
        const { error } = await db().from("processes").update(patch as never).eq("id", p[0].id);
        if (error) throw error;
        return { processo: p[0].numero_processo, link_no_portal: `/admin/processes/${p[0].id}` };
      },
    },

    // ───────── ANDAMENTOS ─────────
    {
      name: "listar_andamentos",
      kind: "read",
      perm: ["processos"],
      label: "Consultou os andamentos",
      description: "Andamentos dos processos agrupados por processo. situacao: novo (não tratados, padrão) | tratado | descartado. Filtre por número do processo, parte ou cliente em busca.",
      parameters: obj({ situacao: { type: "string", enum: ["novo", "tratado", "descartado"] }, busca: { type: "string" }, so_importantes: { type: "boolean" } }),
      run: async (a) => {
        let q = db()
          .from("andamentos")
          .select("data, descricao, tipo, importante, situacao, processes!inner(id, numero_processo, titulo, cliente_nome, clients(name))")
          .eq("situacao", String(a.situacao ?? "novo") as "novo")
          .order("data", { ascending: false })
          .limit(300);
        if (a.so_importantes) q = q.eq("importante", true);
        const { data } = await q;
        const termo = limpa(a.busca).toLowerCase();
        const grupos = new Map<string, { processo: string; titulo: string | null; cliente: string | null; link_no_portal: string; andamentos: string[]; importantes: number }>();
        for (const x of data ?? []) {
          const p = x.processes as unknown as { id: string; numero_processo: string; titulo: string | null; cliente_nome: string | null; clients: { name: string } | null };
          if (termo && !`${p.numero_processo} ${p.titulo} ${p.cliente_nome} ${p.clients?.name} ${x.descricao}`.toLowerCase().includes(termo)) continue;
          const g = grupos.get(p.id) ?? { processo: p.numero_processo, titulo: p.titulo, cliente: p.clients?.name ?? p.cliente_nome, link_no_portal: `/admin/processes/${p.id}#andamentos`, andamentos: [], importantes: 0 };
          g.andamentos.push(`${x.data.slice(0, 10).split("-").reverse().join("/")}${x.importante ? " [importante]" : ""}: ${x.descricao.slice(0, 300)}`);
          if (x.importante) g.importantes++;
          grupos.set(p.id, g);
        }
        return { processos: grupos.size, grupos: [...grupos.values()].slice(0, 40), tela: "/admin/alertas?aba=andamentos" };
      },
    },
    {
      name: "andamentos_do_processo",
      kind: "read",
      perm: ["processos"],
      label: "Leu os andamentos do processo",
      description: "Histórico de andamentos de UM processo (pelo número, parte ou cliente) com a capa (partes, juízo, classe).",
      parameters: obj({ processo: { type: "string" }, so_importantes: { type: "boolean" }, limite: { type: "integer" } }, ["processo"]),
      run: async (a) => {
        const p = await processoPorTermo(db, a.processo);
        let q = db()
          .from("andamentos")
          .select("data, descricao, tipo, importante, situacao")
          .eq("process_id", p.id)
          .neq("tipo", "tarefa")
          .order("data", { ascending: false })
          .limit(Math.min(Number(a.limite) || 40, 200));
        if (a.so_importantes) q = q.eq("importante", true);
        const { data } = await q;
        return {
          processo: p.numero_processo,
          titulo: p.titulo,
          juizo: p.vara_tribunal,
          classe: p.classe,
          partes: p.partes,
          andamentos: (data ?? []).map(
            (x) => `${x.data.slice(0, 10).split("-").reverse().join("/")}${x.importante ? " [importante]" : ""}${x.situacao === "novo" ? " [não tratado]" : ""}: ${x.descricao.slice(0, 400)}`
          ),
          link_no_portal: `/admin/processes/${p.id}#andamentos`,
        };
      },
    },
    {
      name: "marcar_andamentos",
      kind: "write",
      perm: ["processos"],
      label: "Marcou andamentos",
      description: "Marca como tratados (ou descartados) os andamentos NÃO tratados de um processo (pelo número/parte), ou de todos se todos=true.",
      parameters: obj({ processo: { type: "string" }, todos: { type: "boolean" }, situacao: { type: "string", enum: ["tratado", "descartado"] } }, ["situacao"]),
      run: async (a, ctx) => {
        let q = db()
          .from("andamentos")
          .update({ situacao: String(a.situacao) as "tratado" | "descartado", tratado_por: ctx.profileId, tratado_em: new Date().toISOString() }, { count: "exact" })
          .eq("situacao", "novo");
        if (!a.todos) {
          if (!a.processo) throw new Error("Diga de qual processo (ou todos=true).");
          q = q.eq("process_id", (await processoPorTermo(db, a.processo)).id);
        }
        const { count, error } = await q;
        if (error) throw error;
        return { marcados: count ?? 0, situacao: a.situacao };
      },
    },
    {
      name: "ler_andamentos_agora",
      kind: "write",
      perm: ["processos"],
      label: "Leu os andamentos agora",
      description: "Busca agora os andamentos novos dos processos (o sistema já faz sozinho de hora em hora, 07h–22h).",
      parameters: obj({}),
      run: async () => {
        const { sincronizarAstrea } = await import("@/lib/andamentos/sync");
        const r = await sincronizarAstrea({ origem: "assistente" });
        if (r.erro) throw new Error(r.erro);
        return { ...r, tela: "/admin/alertas?aba=andamentos" };
      },
    },
    {
      name: "vincular_cliente_processo",
      kind: "write",
      perm: ["processos"],
      label: "Ligou processo a cliente",
      description: "Liga um processo (pelo número/parte) a um cliente do portal — útil para os processos vindos do Astrea sem ficha.",
      parameters: obj({ processo: { type: "string" }, cliente: { type: "string" } }, ["processo", "cliente"]),
      run: async (a) => {
        const [p, c] = await Promise.all([processoPorTermo(db, a.processo), clientePorNome(a.cliente)]);
        await adm().from("processes").update({ client_id: c.id }).eq("id", p.id);
        await adm().from("publicacoes").update({ client_id: c.id }).eq("process_id", p.id);
        return { processo: p.numero_processo, cliente: c.name };
      },
    },

    // ───────── ALERTAS (abas Publicações e Andamentos, como no Astrea) ─────────
    {
      name: "listar_alertas_publicacoes",
      kind: "read",
      perm: ["publicacoes"],
      label: "Consultou os alertas de publicações",
      description: "Alertas da aba Publicações (publicação recebida e ainda não tratada): diário, processo, nome pesquisado e começo do texto.",
      parameters: obj({ busca: { type: "string" } }),
      run: async (a) => {
        const { data } = await db()
          .from("publicacoes")
          .select("id, numero_mascara, numero_processo, diario, tribunal, nome_pesquisado, termo, data_disponibilizacao, texto, titulo_processo")
          .eq("status", "nao_tratada")
          .is("alerta_descartado_em", null)
          .order("created_at", { ascending: false })
          .limit(60);
        const termo = limpa(a.busca).toLowerCase();
        const lista = (data ?? []).filter((p) => !termo || `${p.numero_mascara} ${p.numero_processo} ${p.titulo_processo} ${p.texto}`.toLowerCase().includes(termo));
        return {
          total: lista.length,
          alertas: lista.slice(0, 30).map((p) => ({
            processo: p.numero_mascara ?? p.numero_processo,
            diario: p.diario ?? p.tribunal,
            divulgado: p.data_disponibilizacao.split("-").reverse().join("/"),
            nome_pesquisado: p.nome_pesquisado ?? p.termo,
            partes: p.titulo_processo,
            texto: (p.texto ?? "").replace(/\s+/g, " ").slice(0, 300),
            link_no_portal: `/admin/alertas/publicacao/${p.id}`,
          })),
          tela: "/admin/alertas",
        };
      },
    },
    {
      name: "tratar_publicacao",
      kind: "write",
      perm: ["publicacoes"],
      label: "Tratou publicação",
      description:
        "Na publicação de um processo (número; se houver mais de uma, a mais recente não tratada): concluir (fica tratada), descartar (publicação descartada), descartar_alerta (some dos alertas, continua não tratada) ou reabrir.",
      parameters: obj({ processo: { type: "string" }, acao: { type: "string", enum: ["concluir", "descartar", "descartar_alerta", "reabrir"] } }, ["processo", "acao"]),
      run: async (a, ctx) => {
        const dig = limpa(a.processo).replace(/\D/g, "");
        if (dig.length < 6) throw new Error("Diga o número do processo da publicação.");
        const { data } = await db()
          .from("publicacoes")
          .select("id, numero_mascara, status")
          .like("numero_processo", `%${dig}%`)
          .order("status", { ascending: false })
          .order("data_disponibilizacao", { ascending: false })
          .limit(5);
        const pub = (data ?? []).find((p) => (a.acao === "reabrir" ? p.status !== "nao_tratada" : p.status === "nao_tratada")) ?? data?.[0];
        if (!pub) throw new Error("Não achei publicação desse processo.");
        const agora = new Date().toISOString();
        const campos =
          a.acao === "descartar_alerta"
            ? { alerta_descartado_em: agora }
            : a.acao === "reabrir"
              ? { status: "nao_tratada", tratada_por: null, tratada_em: null, alerta_descartado_em: null }
              : { status: a.acao === "concluir" ? "tratada" : "descartada", tratada_por: ctx.profileId, tratada_em: agora };
        const { error } = await db().from("publicacoes").update(campos).eq("id", pub.id);
        if (error) throw error;
        return { processo: pub.numero_mascara, feito: a.acao };
      },
    },
    {
      name: "adicionar_historico_manual",
      kind: "write",
      perm: ["processos"],
      label: "Adicionou histórico manual",
      description: "Registra um histórico manual no processo (aparece no histórico de andamentos, como no Astrea).",
      parameters: obj({ processo: { type: "string" }, texto: { type: "string" }, data: { type: "string", description: "AAAA-MM-DD (opcional, padrão hoje)" } }, ["processo", "texto"]),
      run: async (a, ctx) => {
        const p = await processoPorTermo(db, a.processo);
        const { data: eu } = await adm().from("profiles").select("full_name").eq("id", ctx.profileId).maybeSingle();
        const dia = limpa(a.data);
        const { error } = await db().from("andamentos").insert({
          process_id: p.id,
          data: /^\d{4}-\d{2}-\d{2}$/.test(dia) ? new Date(`${dia}T12:00:00-03:00`).toISOString() : new Date().toISOString(),
          descricao: String(a.texto ?? "").trim().slice(0, 8000),
          tipo: "nota",
          fonte: "manual",
          situacao: "historico",
          responsavel_nome: eu?.full_name ?? null,
        });
        if (error) throw error;
        return { processo: p.numero_processo, link_no_portal: `/admin/processes/${p.id}#andamentos` };
      },
    },
    {
      name: "comentar_andamento",
      kind: "write",
      perm: ["processos"],
      label: "Comentou andamento",
      description: "Comenta um andamento não tratado do processo (o mais recente, ou o que contém 'trecho').",
      parameters: obj({ processo: { type: "string" }, texto: { type: "string" }, trecho: { type: "string" } }, ["processo", "texto"]),
      run: async (a, ctx) => {
        const and = await andamentoDoAlerta(db, a.processo, a.trecho);
        const { data: eu } = await adm().from("profiles").select("full_name").eq("id", ctx.profileId).maybeSingle();
        const { error } = await adm().from("alerta_comentarios").insert({ andamento_id: and.id, autor_id: ctx.profileId, autor_nome: eu?.full_name ?? null, texto: String(a.texto ?? "").trim().slice(0, 4000) });
        if (error) throw error;
        await adm().from("andamentos").update({ acao: "Comentário adicionado", acao_em: new Date().toISOString(), acao_por: ctx.profileId }).eq("id", and.id);
        return { andamento: and.descricao.slice(0, 120) };
      },
    },
    {
      name: "marcar_andamento_importante",
      kind: "write",
      perm: ["processos"],
      label: "Marcou andamento como importante",
      description: "Marca (ou desmarca, importante=false) como importante um andamento não tratado do processo (o mais recente, ou o que contém 'trecho').",
      parameters: obj({ processo: { type: "string" }, trecho: { type: "string" }, importante: { type: "boolean" } }, ["processo"]),
      run: async (a) => {
        const and = await andamentoDoAlerta(db, a.processo, a.trecho);
        await db().from("andamentos").update({ importante: a.importante !== false }).eq("id", and.id);
        return { andamento: and.descricao.slice(0, 120), importante: a.importante !== false };
      },
    },

    // ───────── MENSAGENS INTERNAS ─────────
    {
      name: "mensagem_para_equipe",
      kind: "write",
      label: "Mandou mensagem interna",
      description: "Manda mensagem interna (portal, não WhatsApp) para uma pessoa da equipe ou para o canal 'Escritório' (para='escritorio').",
      parameters: obj({ para: { type: "string" }, texto: { type: "string" } }, ["para", "texto"]),
      run: async (a, ctx) => {
        let conversa = GERAL;
        if (!/^escrit[oó]rio$|^todos$|^geral$/i.test(limpa(a.para))) {
          const prof = await perfilDaPessoa(a.para);
          conversa = conversaCom(ctx.profileId, prof.id);
        }
        const { error } = await adm().from("chat_mensagens").insert({ conversa, autor_id: ctx.profileId, texto: String(a.texto).slice(0, 5000) });
        if (error) throw error;
        return { ok: true, link_no_portal: `/admin/mensagens?c=${encodeURIComponent(conversa)}` };
      },
    },
  ];
}

/** Perfil (login) da pessoa da equipe — para equipe/permissões; recusa admin máximo. */
async function perfilDaPessoa(alvo: unknown) {
  const p = await pessoaPorNome(alvo);
  if (!p.profile_id) throw new Error(`${p.nome} não tem login no portal.`);
  const { data } = await adm().from("profiles").select("id, full_name, role, super_admin").eq("id", p.profile_id).maybeSingle();
  if (!data) throw new Error("Perfil não encontrado.");
  if (data.super_admin) throw new Error("Não dá para mexer no admin máximo.");
  return data;
}

/** Processo pelo número (com ou sem máscara), parte/título ou cliente. */
/** Andamento não tratado do processo: o mais recente, ou o que contém o trecho. */
async function andamentoDoAlerta(db: () => Db, processo: unknown, trecho: unknown) {
  const p = await processoPorTermo(db, processo);
  const { data } = await db().from("andamentos").select("id, descricao").eq("process_id", p.id).eq("situacao", "novo").order("data", { ascending: false }).limit(50);
  const t = limpa(trecho).toLowerCase();
  const and = (data ?? []).find((x) => !t || x.descricao.toLowerCase().includes(t));
  if (!and) throw new Error("Não achei andamento não tratado nesse processo" + (t ? " com esse trecho." : "."));
  return and;
}

async function processoPorTermo(db: () => Db, termo: unknown) {
  const t = limpa(termo);
  if (!t) throw new Error("Diga qual processo (número, parte ou cliente).");
  const dig = t.replace(/\D/g, "");
  const cols = "id, numero_processo, titulo, vara_tribunal, classe, partes";
  const { data } =
    dig.length >= 7
      ? await db().from("processes").select(cols).like("numero_digitos", `%${dig}%`).limit(5)
      : await db().from("processes").select(cols).or(`titulo.ilike.%${t}%,cliente_nome.ilike.%${t}%,numero_processo.ilike.%${t}%`).limit(5);
  if (!data?.length) throw new Error(`Não achei processo para "${t}".`);
  if (data.length > 1) throw new Error(`Mais de um processo para "${t}": ${data.map((p) => `${p.numero_processo} (${p.titulo ?? ""})`).join("; ")}. Diga qual.`);
  return data[0];
}
