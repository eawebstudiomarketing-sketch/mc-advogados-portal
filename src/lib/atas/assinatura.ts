import "server-only";
import { createHash, createHmac, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { apagarAudio } from "@/lib/transcricao";
import { ensureSubfolder, getDriveSession, uploadBytes } from "@/lib/google-drive";
import type { Registro } from "@/lib/pdf/ata";
import { dataBr, dataHoraBr, PAPEL_ROTULO, TIPOS_ATA, type DadosAta, type Participante } from "./formato";
import { nomeDoPdf, pdfDaAta, sha256 } from "./pdf";
import type { AtaRow } from "./gerar";

// Assinatura das atas pelo próprio portal (decisão de 22/10/2026: atas aqui,
// contratos e procurações continuam na ZapSign). Quem aprova assina pelo
// escritório. Cada pessoa de fora recebe um link pessoal (WhatsApp do
// escritório e/ou e-mail), confere a ata e assina com um código de 6 dígitos.
// Quando todos assinam, sai o PDF com o registro das assinaturas, que vai
// para a ficha do cliente e para a pasta dele no Drive.

const db = () => createAdminClient() as unknown as SupabaseClient;
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br").replace(/\/$/, "");
const BUCKET = "documents";
const CODIGO_MIN = 10;
const MAX_TENTATIVAS = 5;

export type AssinaturaRow = {
  id: string;
  ata_id: string;
  versao: number;
  nome: string;
  papel: Participante["papel"];
  telefone: string | null;
  email: string | null;
  status: "pendente" | "assinada" | "correcao" | "cancelada";
  geracao: number;
  codigo_hash: string | null;
  codigo_expira: string | null;
  codigo_destino: string | null;
  tentativas: number;
  enviado_em: string | null;
  lembretes: number;
  assinado_em: string | null;
  assinado_via: string | null;
  ip: string | null;
  user_agent: string | null;
  correcao: string | null;
  expira_em: string;
};

export const hashToken = (token: string) => createHash("sha256").update(`ata:${token}`).digest("hex");

/** O link de cada pessoa sai do id + geração (no banco só fica o hash). */
function tokenDe(id: string, geracao: number): string {
  const segredo = process.env.ATAS_SEGREDO || process.env.WA_MIDIA_SEGREDO || process.env.CRON_SECRET;
  if (!segredo) throw new Error("Falta o segredo dos links de assinatura (ATAS_SEGREDO).");
  return createHmac("sha256", segredo).update(`assinar:${id}:${geracao}`).digest("base64url").slice(0, 32);
}
const hashCodigo = (id: string, codigo: string) => createHash("sha256").update(`${id}:${codigo}`).digest("hex");

/** Telefone para o zap: só dígitos, com 55. */
export function telefoneZap(t: string | null | undefined): string | null {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}
const emailValido = (e: string | null | undefined) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const mascararTelefone = (d: string) => `(${d.slice(2, 4)}) ${"•".repeat(Math.max(0, d.length - 8))}-${d.slice(-4)}`;
const mascararEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_, a: string, meio: string, dom: string) => `${a}${"•".repeat(Math.min(6, meio.length))}${dom}`);

/* ───────── dados da ata ───────── */

export async function dadosDaAta(ata: AtaRow): Promise<DadosAta> {
  const { data } = ata.client_id ? await db().from("clients").select("name").eq("id", ata.client_id).maybeSingle() : { data: null };
  return {
    tipo: ata.tipo,
    titulo: ata.titulo,
    data_reuniao: ata.data_reuniao,
    local: ata.local,
    pauta: ata.pauta,
    participantes: ata.participantes ?? [],
    cliente: (data as { name: string } | null)?.name ?? null,
  };
}

/* ───────── mensagens ───────── */

async function mandarEmail(para: string, assunto: string, texto: string, link?: { url: string; rotulo: string }) {
  const resend = getResendClient();
  if (!resend) throw new Error("O e-mail (Resend) não está configurado.");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1b1f24;line-height:1.5;max-width:560px">
<p style="font-weight:bold;letter-spacing:.5px">MC ADVOGADOS</p>
${texto
  .split("\n")
  .map((l) => `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
  .join("")}
${link ? `<p><a href="${link.url}" style="display:inline-block;background:#11273b;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${link.rotulo}</a></p>` : ""}
</div>`;
  const { error } = await resend.client.emails.send({ from: resend.from, to: para, subject: assunto, html, text: link ? `${texto}\n\n${link.url}` : texto });
  if (error) throw new Error(error.message);
}

/** Manda pelo zap (se tiver telefone) e por e-mail (se tiver). Devolve por onde foi. */
async function avisar(
  pessoa: { telefone?: string | null; email?: string | null },
  { zap, assunto, email, link, origem }: { zap: string; assunto: string; email: string; link?: { url: string; rotulo: string }; origem: string }
): Promise<string[]> {
  const foi: string[] = [];
  const tel = telefoneZap(pessoa.telefone);
  if (tel && (await enfileirarMensagem({ para: tel, texto: zap, origemRef: origem }))) foi.push("WhatsApp");
  if (emailValido(pessoa.email)) {
    try {
      await mandarEmail(pessoa.email!.trim(), assunto, email, link);
      foi.push("e-mail");
    } catch (e) {
      console.error("ata (e-mail):", e instanceof Error ? e.message : e);
    }
  }
  return foi;
}

/** Aviso para quem criou a ata (zap da pessoa na equipe; senão e-mail). */
async function avisarDono(ata: Pick<AtaRow, "id" | "profile_id">, texto: string) {
  const { data: r } = await db().from("responsaveis").select("telefone, email").eq("profile_id", ata.profile_id).maybeSingle();
  const { data: p } = await db().from("profiles").select("email").eq("id", ata.profile_id).maybeSingle();
  const tel = telefoneZap((r as { telefone: string | null } | null)?.telefone);
  const url = `${site()}/admin/atas/${ata.id}`;
  if (tel) await enfileirarMensagem({ para: tel, texto: `${texto}\n${url}`, origemRef: `ata:${ata.id}:dono` });
  else if (emailValido((p as { email: string } | null)?.email)) await mandarEmail((p as { email: string }).email, "Ata — MC Advogados", texto, { url, rotulo: "Abrir a ata" }).catch(() => {});
}

async function enviarLink(a: Pick<AssinaturaRow, "id" | "nome" | "telefone" | "email">, token: string, dados: DadosAta, lembrete = false): Promise<string[]> {
  const url = `${site()}/assinar/${token}`;
  const primeiro = a.nome.split(/\s+/)[0];
  const doc = `${dados.titulo.toLowerCase()} de ${dataBr(dados.data_reuniao)}${dados.cliente ? ` (${dados.cliente})` : ""}`;
  const frase = lembrete ? `Lembrete: a ${doc} ainda aguarda a sua assinatura.` : `A ${doc} está pronta para sua conferência e assinatura.`;
  return avisar(a, {
    zap: `*MC Advogados*\nOlá, ${primeiro}! ${frase}\n\nConfira e assine por este link pessoal (válido por 30 dias):\n${url}`,
    assunto: lembrete ? `Lembrete: ata aguardando sua assinatura — MC Advogados` : `Ata para assinatura — MC Advogados`,
    email: `Olá, ${primeiro}!\n${frase}\nO link abaixo é pessoal e vale por 30 dias.`,
    link: { url, rotulo: "Conferir e assinar a ata" },
    origem: `ata:${a.id}:link`,
  });
}

/* ───────── aprovar e enviar ───────── */

export type Aprovador = { profileId: string; nome: string; ip: string | null; ua: string | null };

/**
 * Aprova a ata: gera a versão do cliente (sem as partes internas), guarda o
 * PDF com a impressão digital, registra a assinatura de quem aprovou e manda
 * o link para cada pessoa de fora. Sem ninguém de fora, já fecha a ata.
 */
export async function aprovarEEnviar(ataId: string, aprovador: Aprovador, signatarios: Participante[]): Promise<{ enviados: { nome: string; via: string[] }[] }> {
  const { data: ata } = await db().from("atas").select("*").eq("id", ataId).single<AtaRow & { versao: number; aprovada_em: string | null }>();
  if (!ata) throw new Error("Ata não encontrada.");
  if (ata.status !== "rascunho") throw new Error("Só dá para aprovar uma ata em rascunho.");
  if (!ata.texto?.trim()) throw new Error("A ata está vazia.");
  const versao = ata.aprovada_em ? ata.versao + 1 : ata.versao;
  const dados = await dadosDaAta(ata);
  const deFora = TIPOS_ATA[ata.tipo].assinaCliente ? signatarios.filter((s) => s.papel !== "escritorio") : signatarios;
  for (const s of deFora) if (!telefoneZap(s.telefone) && !emailValido(s.email)) throw new Error(`Falta o WhatsApp ou o e-mail de ${s.nome} para mandar o link.`);

  // versão que vai para assinatura: a do cliente nas reuniões com cliente; a completa nas internas
  const paraCliente = TIPOS_ATA[ata.tipo].assinaCliente;
  const pdf = await pdfDaAta(dados, ata.texto, paraCliente ? "cliente" : "completa");
  const hash = sha256(pdf);
  const caminho = `internal/${ata.client_id ?? "escritorio"}/atas/${ata.id}/v${versao}-para-assinatura.pdf`;
  const up = await createAdminClient().storage.from(BUCKET).upload(caminho, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`Não consegui guardar o PDF: ${up.error.message}`);

  // versões antigas deixam de valer
  await db().from("ata_assinaturas").update({ status: "cancelada" }).eq("ata_id", ata.id).eq("status", "pendente");
  await db()
    .from("atas")
    .update({ status: "aguardando", versao, aprovada_por: aprovador.profileId, aprovada_em: new Date().toISOString(), pdf_cliente_path: caminho, pdf_hash: hash, correcao: null, updated_at: new Date().toISOString() })
    .eq("id", ata.id);
  await db().from("ata_assinaturas").insert({
    ata_id: ata.id,
    versao,
    nome: aprovador.nome,
    papel: "escritorio",
    status: "assinada",
    assinado_em: new Date().toISOString(),
    assinado_via: "Aprovou a ata no Portal MC Advogados (acesso com login)",
    ip: aprovador.ip,
    user_agent: aprovador.ua,
  });

  const enviados: { nome: string; via: string[] }[] = [];
  for (const s of deFora) {
    const { data: linha } = await db()
      .from("ata_assinaturas")
      .insert({ ata_id: ata.id, versao, nome: s.nome, papel: s.papel, telefone: telefoneZap(s.telefone), email: emailValido(s.email) ? s.email!.trim() : null })
      .select("id, nome, telefone, email")
      .single();
    if (!linha) continue;
    const token = tokenDe(linha.id, 0);
    await db().from("ata_assinaturas").update({ token_hash: hashToken(token), enviado_em: new Date().toISOString() }).eq("id", linha.id);
    const via = await enviarLink(linha, token, dados);
    enviados.push({ nome: s.nome, via });
  }
  if (ata.transcricao_id) await apagarAudio(ata.transcricao_id);
  await finalizarSeCompleta(ata.id);
  return { enviados };
}

/** Novo link para uma pessoa (o anterior para de funcionar). */
export async function reenviarLink(assinaturaId: string): Promise<string[]> {
  const { data: a } = await db().from("ata_assinaturas").select("*").eq("id", assinaturaId).single<AssinaturaRow>();
  if (!a || a.status !== "pendente") throw new Error("Essa assinatura não está pendente.");
  const { data: ata } = await db().from("atas").select("*").eq("id", a.ata_id).single<AtaRow>();
  if (!ata) throw new Error("Ata não encontrada.");
  const token = tokenDe(a.id, a.geracao + 1);
  await db()
    .from("ata_assinaturas")
    .update({ token_hash: hashToken(token), geracao: a.geracao + 1, tentativas: 0, codigo_hash: null, codigo_expira: null, enviado_em: new Date().toISOString(), expira_em: new Date(Date.now() + 30 * 86_400_000).toISOString() })
    .eq("id", a.id);
  return enviarLink(a, token, await dadosDaAta(ata));
}

/** Volta a ata para rascunho e cancela os links pendentes. */
export async function cancelarAssinaturas(ataId: string): Promise<void> {
  await db().from("ata_assinaturas").update({ status: "cancelada" }).eq("ata_id", ataId).eq("status", "pendente");
  await db().from("atas").update({ status: "rascunho", updated_at: new Date().toISOString() }).eq("id", ataId).eq("status", "aguardando");
}

/* ───────── página pública ───────── */

export type PaginaAssinatura = {
  assinatura: AssinaturaRow;
  ata: AtaRow & { pdf_cliente_path: string | null; pdf_hash: string | null; pdf_final_path: string | null; versao: number };
  dados: DadosAta;
  vencido: boolean;
};

export async function abrirPorToken(token: string): Promise<PaginaAssinatura | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const { data: a } = await db().from("ata_assinaturas").select("*").eq("token_hash", hashToken(token)).maybeSingle<AssinaturaRow>();
  if (!a) return null;
  const { data: ata } = await db().from("atas").select("*").eq("id", a.ata_id).single();
  if (!ata) return null;
  return { assinatura: a, ata, dados: await dadosDaAta(ata), vencido: vencida(a) };
}

const travada = (a: AssinaturaRow) => a.tentativas >= MAX_TENTATIVAS;
const vencida = (a: AssinaturaRow) => new Date(a.expira_em).getTime() < Date.now();

/** Manda o código de 6 dígitos (zap ou e-mail). */
export async function pedirCodigo(token: string, canal: "zap" | "email"): Promise<{ destino: string }> {
  const p = await abrirPorToken(token);
  if (!p) throw new Error("Link inválido.");
  const { assinatura: a } = p;
  if (a.status !== "pendente") throw new Error("Esta assinatura não está mais pendente.");
  if (vencida(a)) throw new Error("Este link venceu. Peça um novo ao escritório.");
  if (travada(a)) throw new Error("Muitas tentativas erradas. Peça um novo link ao escritório.");
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const texto = `Seu código para assinar a ata da MC Advogados: ${codigo}\nVale por ${CODIGO_MIN} minutos. Não passe este código para ninguém.`;
  let destino: string;
  if (canal === "zap" && a.telefone) {
    const ok = await enfileirarMensagem({ para: a.telefone, texto, origemRef: `ata:${a.id}:codigo`, expiraEm: new Date(Date.now() + CODIGO_MIN * 60_000) });
    if (!ok) throw new Error("Não consegui mandar o código pelo WhatsApp agora. Tente pelo e-mail.");
    destino = `WhatsApp ${mascararTelefone(a.telefone)}`;
  } else if (canal === "email" && a.email) {
    await mandarEmail(a.email, `Código ${codigo} — assinatura da ata`, texto);
    destino = `e-mail ${mascararEmail(a.email)}`;
  } else throw new Error("Esse canal não está disponível para você.");
  await db()
    .from("ata_assinaturas")
    .update({ codigo_hash: hashCodigo(a.id, codigo), codigo_expira: new Date(Date.now() + CODIGO_MIN * 60_000).toISOString(), codigo_destino: destino })
    .eq("id", a.id);
  return { destino };
}

/** Confere o código e registra a assinatura. */
export async function assinarComCodigo(token: string, codigo: string, meta: { ip: string | null; ua: string | null }): Promise<{ completa: boolean }> {
  const p = await abrirPorToken(token);
  if (!p) throw new Error("Link inválido.");
  const { assinatura: a, ata } = p;
  if (a.status === "assinada") return { completa: ata.status === "assinada" };
  if (a.status !== "pendente" || ata.status !== "aguardando") throw new Error("Esta ata não está mais aguardando assinatura.");
  if (vencida(a)) throw new Error("Este link venceu. Peça um novo ao escritório.");
  if (travada(a)) throw new Error("Muitas tentativas erradas. Peça um novo link ao escritório.");
  if (!a.codigo_hash || !a.codigo_expira || new Date(a.codigo_expira).getTime() < Date.now()) throw new Error("O código venceu. Peça outro.");
  if (hashCodigo(a.id, codigo.replace(/\D/g, "")) !== a.codigo_hash) {
    await db().from("ata_assinaturas").update({ tentativas: a.tentativas + 1 }).eq("id", a.id);
    const restam = MAX_TENTATIVAS - a.tentativas - 1;
    throw new Error(restam > 0 ? `Código errado. Restam ${restam} tentativa(s).` : "Código errado. O link foi travado: peça um novo ao escritório.");
  }
  await db()
    .from("ata_assinaturas")
    .update({ status: "assinada", assinado_em: new Date().toISOString(), assinado_via: `Código confirmado por ${a.codigo_destino}`, ip: meta.ip, user_agent: meta.ua, codigo_hash: null })
    .eq("id", a.id);
  return { completa: await finalizarSeCompleta(ata.id) };
}

/** A pessoa pede correção: a ata volta para rascunho e o dono é avisado. */
export async function pedirCorrecao(token: string, texto: string): Promise<void> {
  const p = await abrirPorToken(token);
  if (!p) throw new Error("Link inválido.");
  const { assinatura: a, ata } = p;
  if (a.status !== "pendente" || ata.status !== "aguardando") throw new Error("Esta ata não está mais aguardando assinatura.");
  const pedido = texto.trim().slice(0, 2000);
  if (pedido.length < 3) throw new Error("Escreva o que precisa ser corrigido.");
  await db().from("ata_assinaturas").update({ status: "correcao", correcao: pedido }).eq("id", a.id);
  await db().from("ata_assinaturas").update({ status: "cancelada" }).eq("ata_id", ata.id).eq("status", "pendente");
  await db().from("atas").update({ status: "rascunho", correcao: `${a.nome}: ${pedido}`, updated_at: new Date().toISOString() }).eq("id", ata.id);
  await avisarDono(ata, `✏️ ${a.nome} pediu correção na ata "${ata.titulo}":\n"${pedido}"\nCorrija e aprove de novo (os outros assinam a nova versão).`);
}

/* ───────── fechamento ───────── */

const aparelho = (ua: string | null) => {
  if (!ua) return null;
  const so = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [so, nav].filter(Boolean).join(" / ") || null;
};

/** Se todos da versão atual assinaram: PDF final, ficha do cliente, Drive e avisos. */
export async function finalizarSeCompleta(ataId: string): Promise<boolean> {
  const { data: ata } = await db().from("atas").select("*").eq("id", ataId).single<AtaRow & { versao: number; pdf_hash: string | null; aprovada_por: string | null }>();
  if (!ata || ata.status !== "aguardando") return ata?.status === "assinada";
  const { data: linhas } = await db().from("ata_assinaturas").select("*").eq("ata_id", ataId).eq("versao", ata.versao).neq("status", "cancelada").order("created_at");
  const todas = (linhas ?? []) as AssinaturaRow[];
  if (!todas.length || todas.some((l) => l.status !== "assinada")) return false;

  const dados = await dadosDaAta(ata);
  const paraCliente = TIPOS_ATA[ata.tipo].assinaCliente;
  const documento = `${dados.titulo}${dados.cliente ? ` — ${dados.cliente}` : ""} — ${dataBr(dados.data_reuniao)} — versão ${ata.versao}`;
  const registro: Registro = {
    documento,
    hash: ata.pdf_hash ?? "",
    assinaturas: todas.map((l) => ({
      nome: l.nome,
      papel: PAPEL_ROTULO[l.papel],
      quando: `${dataHoraBr(l.assinado_em!)} (horário de Brasília)`,
      via: l.assinado_via ?? "",
      ip: l.ip,
      aparelho: aparelho(l.user_agent),
    })),
  };
  const pdf = await pdfDaAta(dados, ata.texto, paraCliente ? "cliente" : "completa", registro);
  const caminho = `internal/${ata.client_id ?? "escritorio"}/atas/${ata.id}/v${ata.versao}-assinada.pdf`;
  const up = await createAdminClient().storage.from(BUCKET).upload(caminho, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`Não consegui guardar o PDF assinado: ${up.error.message}`);

  // ficha do cliente (card ATAs) e pasta dele no Drive (só a versão do cliente)
  let documentId: string | null = null;
  if (ata.client_id) {
    let driveId: string | null = null;
    if (paraCliente) {
      try {
        const sessao = await getDriveSession();
        const { data: c } = await db().from("clients").select("drive_folder_id").eq("id", ata.client_id).maybeSingle();
        const pasta = (c as { drive_folder_id: string | null } | null)?.drive_folder_id;
        if (sessao && pasta) {
          const sub = await ensureSubfolder(sessao.token, pasta, "Atas assinadas");
          driveId = await uploadBytes(sessao.token, { name: nomeDoPdf(dados, " (assinada)"), mimeType: "application/pdf", bytes: new Uint8Array(pdf), parentId: sub });
        }
      } catch (e) {
        console.error("ata → Drive:", e instanceof Error ? e.message : e);
      }
    }
    const { data: doc } = await db()
      .from("documents")
      .insert({
        client_id: ata.client_id,
        uploaded_by: ata.aprovada_por ?? ata.profile_id,
        category: "ata",
        title: `${dados.titulo} — ${dataBr(dados.data_reuniao)} (assinada)`,
        file_path: caminho,
        meeting_date: new Date(ata.data_reuniao).toLocaleDateString("en-CA", { timeZone: "America/Bahia" }),
        drive_file_id: driveId,
      })
      .select("id")
      .single();
    documentId = (doc as { id: string } | null)?.id ?? null;
  }
  await db().from("atas").update({ status: "assinada", pdf_final_path: caminho, document_id: documentId, updated_at: new Date().toISOString() }).eq("id", ata.id);

  // avisos: cada pessoa de fora recebe a cópia (link da página, que agora baixa o PDF assinado)
  for (const l of todas.filter((x) => x.papel !== "escritorio")) {
    await avisar(l, {
      zap: `*MC Advogados*\nA ata de ${dataBr(dados.data_reuniao)} foi assinada por todos. A cópia assinada fica no mesmo link que você usou para assinar.`,
      assunto: "Ata assinada por todos — MC Advogados",
      email: `A ata de ${dataBr(dados.data_reuniao)} foi assinada por todos. A cópia assinada fica disponível no mesmo link que você usou para assinar.`,
      origem: `ata:${l.id}:fim`,
    }).catch(() => []);
  }
  if (todas.some((l) => l.papel !== "escritorio")) await avisarDono(ata, `✅ A ata "${ata.titulo}" foi assinada por todos.`).catch(() => {});
  return true;
}

/* ───────── lembretes (cron diário) ───────── */

/** 2 e 5 dias depois do envio, lembra quem não assinou; depois avisa o dono uma vez. */
export async function lembrarAssinaturas(): Promise<{ lembretes: number; avisos: number }> {
  const { data } = await db().from("ata_assinaturas").select("*").eq("status", "pendente").not("enviado_em", "is", null).lt("lembretes", 3).limit(200);
  let lembretes = 0;
  let avisos = 0;
  for (const a of (data ?? []) as AssinaturaRow[]) {
    const dias = (Date.now() - new Date(a.enviado_em!).getTime()) / 86_400_000;
    const { data: ata } = await db().from("atas").select("*").eq("id", a.ata_id).single<AtaRow & { versao: number }>();
    if (!ata || ata.status !== "aguardando" || ata.versao !== a.versao || vencida(a)) continue;
    if ((a.lembretes === 0 && dias >= 2) || (a.lembretes === 1 && dias >= 5)) {
      // o mesmo link de antes (sai do id + geração)
      await db().from("ata_assinaturas").update({ lembretes: a.lembretes + 1, ultimo_lembrete: new Date().toISOString() }).eq("id", a.id);
      await enviarLink(a, tokenDe(a.id, a.geracao), await dadosDaAta(ata), true);
      lembretes++;
    } else if (a.lembretes === 2 && dias >= 7) {
      await db().from("ata_assinaturas").update({ lembretes: 3 }).eq("id", a.id);
      await avisarDono(ata, `⏳ ${a.nome} ainda não assinou a ata "${ata.titulo}" (enviada há ${Math.floor(dias)} dias, com 2 lembretes).`);
      avisos++;
    }
  }
  return { lembretes, avisos };
}
