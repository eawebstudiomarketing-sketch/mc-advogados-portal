import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { apagarAudio } from "@/lib/transcricao";
import { ensureSubfolder, getDriveSession, uploadBytes } from "@/lib/google-drive";
import { dataBr, PAPEL_ROTULO, TIPOS_ATA } from "./formato";
import { nomeDoPdf, pdfDaAta, sha256 } from "./pdf";
import { dadosDaAta, pastaDaAta, telefoneZap, type Aprovador, type AtaCompleta, type OpcoesEnvio, type Signatario } from "./assinatura";

// "Enviar pela ZapSign" (22/10/2026): para a ata complexa (vai para Junta/
// cartório, pode virar prova numa disputa, alguém só tem A3/Gov.br), a ata
// aprovada sai pela API OFICIAL da ZapSign — com o registro da empresa neutra,
// reconhecimento facial com prova de vida e certificado A1/A3. Precisa do
// plano com API (ZAPSIGN_API_TOKEN); ZAPSIGN_API_URL troca para o ambiente de
// testes (https://sandbox.api.zapsign.com.br, sem validade jurídica). O
// portal consulta o status na ZapSign (ao abrir a ata, no botão "Atualizar",
// no cron diário e quando chega o webhook) e, quando todos assinam, guarda o
// PDF assinado deles na ficha do cliente e no Drive.

const db = () => createAdminClient() as unknown as SupabaseClient;
const storage = () => createAdminClient().storage.from("documents");
const base = () => (process.env.ZAPSIGN_API_URL || "https://api.zapsign.com.br").replace(/\/$/, "");
const emailValido = (e: string | null | undefined) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export function zapsignConfigurado(): { ok: boolean; sandbox: boolean } {
  return { ok: !!process.env.ZAPSIGN_API_TOKEN, sandbox: /sandbox/.test(base()) };
}

type ZsSigner = { token: string; sign_url: string; status: string; name: string; email?: string; signed_at: string | null; external_id?: string | null; times_viewed?: number };
type ZsDoc = { token: string; status: string; name: string; signed_file: string | null; original_file: string | null; signers: ZsSigner[]; external_id?: string | null };

async function zs<T>(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  const token = process.env.ZAPSIGN_API_TOKEN;
  if (!token) throw new Error("A integração com a ZapSign não está ligada (falta a chave da API).");
  const r = await fetch(`${base()}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(45_000),
  });
  const texto = await r.text();
  if (!r.ok) {
    console.error("ZapSign:", metodo, caminho, r.status, texto.slice(0, 500));
    if (r.status === 401 || r.status === 403) throw new Error("A ZapSign recusou a chave da API (plano sem API ou chave errada).");
    throw new Error(`A ZapSign respondeu ${r.status}: ${texto.slice(0, 200)}`);
  }
  return (texto ? JSON.parse(texto) : {}) as T;
}

/** Data AAAA-MM-DD no fuso da Bahia, daqui a N dias. */
const daquiA = (dias: number) => new Date(Date.now() + dias * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Bahia" });

/**
 * Aprova a ata e cria o documento na ZapSign. Quem aprova também assina por
 * lá (pelo escritório). Os links vão por e-mail (ZapSign) e pelo WhatsApp do
 * escritório (portal, sem custo).
 */
export async function enviarParaZapsign(
  ataId: string,
  aprovador: Aprovador & { email: string | null },
  signatarios: Signatario[],
  opcoes: OpcoesEnvio & { reconhecimentoFacial?: boolean }
): Promise<{ enviados: { nome: string; via: string[] }[] }> {
  const { data: ata } = await db().from("atas").select("*").eq("id", ataId).single<AtaCompleta>();
  if (!ata) throw new Error("Ata não encontrada.");
  if (ata.status !== "rascunho") throw new Error("Só dá para enviar uma ata em rascunho.");
  if (!ata.texto?.trim()) throw new Error("A ata está vazia.");
  const versao = ata.aprovada_em ? ata.versao + 1 : ata.versao;
  const dados = await dadosDaAta(ata);
  const paraCliente = TIPOS_ATA[ata.tipo].assinaCliente;
  const assinam = signatarios.filter((s) => !s.observador);
  for (const s of assinam) if (!emailValido(s.email) && !telefoneZap(s.telefone)) throw new Error(`Falta o e-mail ou o WhatsApp de ${s.nome}.`);
  if (!emailValido(aprovador.email)) throw new Error("Seu e-mail não está no cadastro: a ZapSign precisa dele para você assinar pelo escritório.");
  const prazoDias = Math.min(90, Math.max(1, Math.round(opcoes.prazoDias ?? 30)));

  // a ZapSign põe a própria página de assinaturas e o relatório: o PDF vai sem o nosso bloco
  const pdf = await pdfDaAta(dados, ata.texto, paraCliente ? "cliente" : "completa");
  const caminho = `${pastaDaAta(ata)}/v${versao}-zapsign-original.pdf`;
  await storage().upload(caminho, pdf, { contentType: "application/pdf", upsert: true });

  const telefone = (t: string | null | undefined) => telefoneZap(t)?.slice(2) ?? null;
  const signer = (s: Signatario & { externo: string }, ordem: number) => {
    const tel = telefone(s.telefone);
    const email = emailValido(s.email) ? s.email!.trim() : null;
    const ex = s.exige ?? {};
    return {
      name: s.nome,
      email: email ?? "",
      phone_country: tel ? "55" : "",
      phone_number: tel ?? "",
      auth_mode: ex.certificado ? "certificadoDigital" : email ? "assinaturaTela-tokenEmail" : "assinaturaTela-tokenSms",
      send_automatic_email: !!email,
      send_automatic_whatsapp: false,
      lock_name: true,
      blank_email: !email,
      blank_phone: !tel,
      require_cpf: !!ex.documento || !!ex.certificado,
      require_selfie_photo: !!ex.selfie,
      require_document_photo: !!ex.documento,
      ...(ex.selfie && ex.documento && opcoes.reconhecimentoFacial ? { selfie_validation_type: "liveness-document-match" } : {}),
      qualification: s.papel === "testemunha" ? "testemunha" : PAPEL_ROTULO[s.papel].toLowerCase(),
      order_group: ordem,
      external_id: s.externo,
    };
  };

  // linhas no portal primeiro (o id vira o external_id de cada signatário)
  await db().from("ata_assinaturas").update({ status: "cancelada" }).eq("ata_id", ata.id).eq("status", "pendente");
  const linhas: { id: string; s: Signatario; ordem: number }[] = [];
  const todos: (Signatario & { ordem: number })[] = [
    { nome: aprovador.nome, papel: "escritorio", email: aprovador.email, telefone: null, ordem: 1 },
    ...assinam.map((s, i) => ({ ...s, ordem: opcoes.ordem ? Math.max(1, Math.round(s.ordem ?? i + 2)) : 1 })),
  ];
  for (const s of todos) {
    const { data } = await db()
      .from("ata_assinaturas")
      .insert({
        ata_id: ata.id,
        versao,
        nome: s.nome,
        papel: s.papel,
        telefone: telefoneZap(s.telefone),
        email: emailValido(s.email) ? s.email!.trim() : null,
        ordem: s.ordem,
        exige: { selfie: !!s.exige?.selfie, documento: !!s.exige?.documento, certificado: !!s.exige?.certificado },
        expira_em: new Date(Date.now() + prazoDias * 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (data) linhas.push({ id: data.id, s, ordem: s.ordem });
  }

  let doc: ZsDoc;
  try {
    doc = await zs<ZsDoc>("POST", "/api/v1/docs/", {
      name: `${dados.titulo}${dados.cliente ? ` — ${dados.cliente}` : ""} — ${dataBr(dados.data_reuniao)} (v${versao})`.slice(0, 250),
      base64_pdf: pdf.toString("base64"),
      lang: "pt-br",
      external_id: ata.id,
      folder_path: "/Portal MC/Atas/",
      brand_name: "MC Advogados",
      date_limit_to_sign: daquiA(prazoDias),
      signature_order_active: !!opcoes.ordem,
      allow_refuse_signature: true,
      ...(opcoes.lembretes?.length ? { reminder_every_n_days: Math.max(1, opcoes.lembretes[0]) } : {}),
      observers: signatarios.filter((s) => s.observador && emailValido(s.email)).map((s) => s.email!.trim()).slice(0, 20),
      signers: linhas.map((l) => signer({ ...l.s, externo: l.id }, l.ordem)),
    });
  } catch (e) {
    await db().from("ata_assinaturas").delete().in("id", linhas.map((l) => l.id));
    throw e;
  }

  await db()
    .from("atas")
    .update({
      status: "aguardando",
      assinatura_via: "zapsign",
      zapsign_token: doc.token,
      zapsign_sincronizado_em: new Date().toISOString(),
      versao,
      aprovada_por: aprovador.profileId,
      aprovada_em: new Date().toISOString(),
      pdf_cliente_path: caminho,
      pdf_hash: sha256(pdf),
      ordem_assinatura: !!opcoes.ordem,
      prazo_assinatura: new Date(Date.now() + prazoDias * 86_400_000).toISOString(),
      correcao: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ata.id);

  // guarda o token e o link de cada um; o link também vai pelo WhatsApp do escritório
  const enviados: { nome: string; via: string[] }[] = [];
  for (const l of linhas) {
    const zsS = doc.signers.find((x) => x.external_id === l.id) ?? doc.signers[linhas.indexOf(l)];
    if (!zsS) continue;
    await db().from("ata_assinaturas").update({ zapsign_token: zsS.token, link_externo: zsS.sign_url, enviado_em: new Date().toISOString() }).eq("id", l.id);
    const via: string[] = [];
    if (emailValido(l.s.email)) via.push("e-mail (ZapSign)");
    const tel = telefoneZap(l.s.telefone);
    if (tel && l.s.papel !== "escritorio" && (!opcoes.ordem || l.ordem === Math.min(...linhas.map((x) => x.ordem)))) {
      const ok = await enfileirarMensagem({
        para: tel,
        texto: `*MC Advogados*\nOlá, ${l.s.nome.split(/\s+/)[0]}! A ${dados.titulo.toLowerCase()} de ${dataBr(dados.data_reuniao)} está pronta para sua assinatura (pela ZapSign):\n${zsS.sign_url}`,
        origemRef: `ata:${l.id}:link`,
      });
      if (ok) via.push("WhatsApp");
    }
    enviados.push({ nome: l.s.nome, via });
  }
  if (ata.transcricao_id) await apagarAudio(ata.transcricao_id);
  return { enviados };
}

/** Consulta a ZapSign e atualiza as assinaturas; quando todos assinam, guarda o PDF assinado. */
export async function sincronizarZapsign(ataId: string, { intervaloMinimoMs = 0 }: { intervaloMinimoMs?: number } = {}): Promise<{ status: string }> {
  const { data: ata } = await db().from("atas").select("*").eq("id", ataId).single<AtaCompleta>();
  if (!ata?.zapsign_token || ata.assinatura_via !== "zapsign") return { status: ata?.status ?? "?" };
  if (ata.status !== "aguardando") return { status: ata.status };
  // ao abrir a ata: no máximo uma consulta por minuto
  const ultima = (ata as AtaCompleta & { zapsign_sincronizado_em?: string | null }).zapsign_sincronizado_em;
  if (intervaloMinimoMs && ultima && Date.now() - Date.parse(ultima) < intervaloMinimoMs) return { status: ata.status };
  const doc = await zs<ZsDoc>("GET", `/api/v1/docs/${ata.zapsign_token}/`);
  const { data: linhas } = await db().from("ata_assinaturas").select("id, nome, papel, status, zapsign_token").eq("ata_id", ata.id).eq("versao", ata.versao).neq("status", "cancelada");
  for (const s of doc.signers ?? []) {
    const l = (linhas ?? []).find((x) => x.zapsign_token === s.token);
    if (!l || l.status === "assinada") continue;
    if (s.signed_at || s.status === "signed") await db().from("ata_assinaturas").update({ status: "assinada", assinado_em: s.signed_at ?? new Date().toISOString(), assinado_via: "Assinou pela ZapSign (detalhes no relatório da ZapSign)" }).eq("id", l.id);
  }
  await db().from("atas").update({ zapsign_sincronizado_em: new Date().toISOString() }).eq("id", ata.id);

  if (doc.status === "recusado") {
    await db().from("ata_assinaturas").update({ status: "cancelada" }).eq("ata_id", ata.id).eq("status", "pendente");
    await db().from("atas").update({ status: "rascunho", correcao: "Alguém recusou assinar na ZapSign (veja o motivo na ZapSign).", updated_at: new Date().toISOString() }).eq("id", ata.id);
    return { status: "rascunho" };
  }
  if (doc.status !== "assinado" || !doc.signed_file) return { status: "aguardando" };

  // todos assinaram: baixa o PDF da ZapSign (com o relatório deles) e guarda
  const r = await fetch(doc.signed_file, { signal: AbortSignal.timeout(45_000) });
  if (!r.ok) throw new Error("Não consegui baixar o PDF assinado da ZapSign.");
  const pdf = Buffer.from(await r.arrayBuffer());
  const dados = await dadosDaAta(ata);
  const caminho = `${pastaDaAta(ata)}/v${ata.versao}-assinada-zapsign.pdf`;
  await storage().upload(caminho, pdf, { contentType: "application/pdf", upsert: true });
  let documentId: string | null = null;
  if (ata.client_id) {
    let driveId: string | null = null;
    try {
      const sessao = await getDriveSession();
      const { data: c } = await db().from("clients").select("drive_folder_id").eq("id", ata.client_id).maybeSingle();
      const pasta = (c as { drive_folder_id: string | null } | null)?.drive_folder_id;
      if (sessao && pasta && TIPOS_ATA[ata.tipo].assinaCliente) {
        const sub = await ensureSubfolder(sessao.token, pasta, "Atas assinadas");
        driveId = await uploadBytes(sessao.token, { name: nomeDoPdf(dados, " (assinada ZapSign)"), mimeType: "application/pdf", bytes: new Uint8Array(pdf), parentId: sub });
      }
    } catch (e) {
      console.error("ata ZapSign → Drive:", e instanceof Error ? e.message : e);
    }
    const { data: d } = await db()
      .from("documents")
      .insert({
        client_id: ata.client_id,
        uploaded_by: ata.aprovada_por ?? ata.profile_id,
        category: "ata",
        title: `${dados.titulo} — ${dataBr(dados.data_reuniao)} (assinada pela ZapSign)`,
        file_path: caminho,
        meeting_date: new Date(ata.data_reuniao).toLocaleDateString("en-CA", { timeZone: "America/Bahia" }),
        drive_file_id: driveId,
      })
      .select("id")
      .single();
    documentId = (d as { id: string } | null)?.id ?? null;
  }
  await db().from("atas").update({ status: "assinada", pdf_final_path: caminho, pdf_final_hash: sha256(pdf), document_id: documentId, updated_at: new Date().toISOString() }).eq("id", ata.id);
  return { status: "assinada" };
}

/** Cancela na ZapSign (exclui o documento lá) e volta a ata para rascunho. */
export async function cancelarNaZapsign(ataId: string): Promise<void> {
  const { data: ata } = await db().from("atas").select("zapsign_token").eq("id", ataId).single();
  if (ata?.zapsign_token) await zs("DELETE", `/api/v1/docs/${ata.zapsign_token}/`).catch((e) => console.error("ZapSign (cancelar):", e instanceof Error ? e.message : e));
}

/** Todas as atas aguardando na ZapSign (cron diário). */
export async function sincronizarTodasZapsign(): Promise<number> {
  if (!zapsignConfigurado().ok) return 0;
  const { data } = await db().from("atas").select("id").eq("status", "aguardando").eq("assinatura_via", "zapsign").limit(100);
  let n = 0;
  for (const a of data ?? []) {
    try {
      await sincronizarZapsign(a.id);
      n++;
    } catch (e) {
      console.error("ZapSign (sincronizar):", a.id, e instanceof Error ? e.message : e);
    }
  }
  return n;
}
