import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fichaNoInpi, logoNoInpi, type FichaINPI } from "./inpi";
import { codigoDoDespacho, prazoDoDespacho, prazosDoDecenio } from "./prazos";

// Grava no portal o que o INPI diz de cada processo (situação real, dados,
// publicações) e recalcula os prazos administrativos. Usado ao cadastrar uma
// marca, pelo robô diário e depois de cada revista nova.

// tabelas da 0061 fora dos tipos gerados
const db = () => createAdminClient() as unknown as SupabaseClient;
const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

type Pub = { rpi: number; data: string; codigo: string; despacho: string; info: string | null };

/** Reescreve os prazos da marca a partir do histórico: pendente se nada saiu depois do despacho. */
export async function recalcularPrazos(marcaId: string, pubs: Pub[], concessao: string | null) {
  const hoje = hojeBahia();
  const ordem = [...pubs].sort((a, b) => a.rpi - b.rpi);
  const linhas: { marca_id: string; acao: string; vence_em: string; situacao: string; origem_rpi: number | null; origem_codigo: string | null }[] = [];
  ordem.forEach((p, i) => {
    const pr = prazoDoDespacho(p.codigo, p.data, p.despacho);
    if (!pr) return;
    const depois = ordem.slice(i + 1).length > 0;
    const situacao = depois ? "realizado" : pr.vence < hoje ? "perdido" : "pendente";
    // só o que ainda importa: pendentes e os dos últimos 90 dias
    if (situacao !== "pendente" && Date.parse(pr.vence) < Date.parse(hoje) - 90 * 86_400_000) return;
    linhas.push({ marca_id: marcaId, acao: pr.acao, vence_em: pr.vence, situacao, origem_rpi: p.rpi, origem_codigo: codigoDoDespacho(p.codigo, p.despacho) || null });
  });
  if (concessao) for (const d of prazosDoDecenio(concessao, hoje)) linhas.push({ marca_id: marcaId, acao: d.acao, vence_em: d.vence, situacao: "pendente", origem_rpi: null, origem_codigo: "decenio" });
  const banco = db();
  // o que a pessoa marcou à mão (realizado/dispensado) não volta para pendente
  const { data: atuais } = await banco.from("marca_prazos").select("acao, vence_em, situacao").eq("marca_id", marcaId);
  const manual = new Map((atuais ?? []).filter((a) => a.situacao === "dispensado" || a.situacao === "realizado").map((a) => [`${a.acao}|${a.vence_em}`, a.situacao]));
  for (const l of linhas) if (manual.has(`${l.acao}|${l.vence_em}`)) l.situacao = manual.get(`${l.acao}|${l.vence_em}`)!;
  await banco.from("marca_prazos").delete().eq("marca_id", marcaId);
  if (linhas.length) await banco.from("marca_prazos").upsert(linhas, { onConflict: "marca_id,acao,vence_em" });
}

/** Aplica a ficha do INPI numa marca da carteira (cria se não existir). */
export async function gravarFicha(f: FichaINPI, extra: { criado_por?: string | null; client_id?: string | null; imagem?: string | null; origem?: string } = {}): Promise<string> {
  const banco = db();
  const ultima = [...f.publicacoes].sort((a, b) => b.rpi - a.rpi)[0];
  const dados = {
    processo: f.processo,
    tipo: "marca",
    nome: f.marca,
    apresentacao: f.apresentacao,
    natureza: f.natureza,
    classe: f.classe,
    especificacao: f.especificacao,
    cfe: f.cfe,
    titular: f.titular,
    procurador: f.procurador,
    deposito: f.deposito,
    concessao: f.concessao,
    vigencia: f.vigencia,
    situacao: f.situacao,
    ...(ultima ? { ultimo_despacho: ultima.despacho, ultimo_despacho_data: ultima.data, ultima_rpi: ultima.rpi, ultimo_despacho_codigo: codigoDoDespacho(null, ultima.despacho) || null } : {}),
    ...(extra.imagem ? { imagem: extra.imagem } : {}),
    ...(extra.client_id ? { client_id: extra.client_id } : {}),
    sincronizado_em: new Date().toISOString(),
  };
  const { data: existente } = await banco.from("marcas").select("id").eq("processo", f.processo).maybeSingle();
  let id = existente?.id as string | undefined;
  if (id) await banco.from("marcas").update(dados).eq("id", id);
  else {
    const { data, error } = await banco
      .from("marcas")
      .insert({ ...dados, acompanhando: true, origem: extra.origem ?? "portal", criado_por: extra.criado_por ?? null })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Não foi possível gravar a marca ${f.processo}: ${error?.message}`);
    id = data.id as string;
  }
  const pubs: Pub[] = f.publicacoes.map((p) => ({ rpi: p.rpi, data: p.data, codigo: codigoDoDespacho(null, p.despacho), despacho: p.despacho, info: p.complemento }));
  if (pubs.length) {
    // sem apagar o código que veio da revista (o pePI não traz o código)
    await banco.from("marca_publicacoes").upsert(
      pubs.map((p) => ({ marca_id: id, ...p })),
      { onConflict: "marca_id,rpi,despacho", ignoreDuplicates: true }
    );
  }
  const { data: todas } = await banco.from("marca_publicacoes").select("rpi, data, codigo, despacho, info").eq("marca_id", id);
  await recalcularPrazos(id!, (todas ?? []) as Pub[], f.concessao);
  return id!;
}

/** Sobe o logo (data URL) para o Storage público "marcas" e devolve o endereço. */
async function guardarLogo(processo: string, dataUrl: string): Promise<string | null> {
  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!m) return null;
  const ext = m[1].includes("png") ? "png" : "jpg";
  const caminho = `${processo}.${ext}`;
  const sb = createAdminClient();
  const { error } = await sb.storage.from("marcas").upload(caminho, Buffer.from(m[2], "base64"), { contentType: m[1], upsert: true });
  if (error) return null;
  return sb.storage.from("marcas").getPublicUrl(caminho).data.publicUrl;
}

/** Busca no INPI e grava (cadastrar processo / atualizar uma marca). */
export async function sincronizarProcesso(processo: string, extra: { criado_por?: string | null; client_id?: string | null; origem?: string; comLogo?: boolean } = {}) {
  const f = await fichaNoInpi(processo);
  if (!f) return { ok: false as const, error: `Processo ${processo} não encontrado no INPI.` };
  const logo = extra.comLogo ? await logoNoInpi(f.processo, f.codPedido).catch(() => null) : null;
  const imagem = logo ? await guardarLogo(f.processo, logo) : null;
  const id = await gravarFicha(f, { ...extra, imagem });
  return { ok: true as const, id, ficha: f };
}

/** Robô diário: atualiza as marcas sincronizadas há mais tempo (em lotes, por causa do tempo da função). */
export async function sincronizarLote(limite = 30, prazoMs = 240_000): Promise<{ feitas: number; erros: string[] }> {
  const inicio = Date.now();
  const { data } = await db().from("marcas").select("processo").eq("acompanhando", true).eq("tipo", "marca").order("sincronizado_em", { ascending: true, nullsFirst: true }).limit(limite);
  let feitas = 0;
  const erros: string[] = [];
  for (const m of data ?? []) {
    if (Date.now() - inicio > prazoMs) break;
    try {
      const r = await sincronizarProcesso(m.processo);
      if (r.ok) feitas++;
      else erros.push(r.error);
    } catch (e) {
      erros.push(`${m.processo}: ${(e as Error).message}`);
    }
  }
  return { feitas, erros };
}
