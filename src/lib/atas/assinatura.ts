import "server-only";
import { createHash, createHmac, randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { apagarAudio } from "@/lib/transcricao";
import { ensureSubfolder, getDriveSession, uploadBytes } from "@/lib/google-drive";
import type { AssinanteNoPdf, Registro, RegistroAssinatura } from "@/lib/pdf/ata";
import { dataBr, dataHoraBr, PAPEL_ROTULO, TIPOS_ATA, type DadosAta, type Participante } from "./formato";
import { nomeDoPdf, pdfDaAta, sha256 } from "./pdf";
import { conferirCertificado, conferirIdentidade, type Certificado, type LocalIp, type Verificacao } from "./identidade";
import type { AtaRow } from "./gerar";
import { carimbar } from "./carimbo";
import { selar, titularDoSelo } from "./selo";

// Assinatura das atas pelo próprio portal, no nível da ZapSign (decisões de
// 22/10/2026: atas aqui, contratos e procurações continuam na ZapSign; só
// certificado A1; selfie e documento guardados enquanto a ata existir; padrão
// = código + assinatura desenhada). Quem aprova assina pelo escritório. Cada
// pessoa de fora recebe um link pessoal (WhatsApp do escritório e/ou e-mail)
// e, na ordem definida, assina: desenho/nome digitado, o que o advogado pediu
// (selfie, documento, certificado A1), localização e código de 6 dígitos.
// Observadores só acompanham. Quando todos assinam, sai o PDF com as
// assinaturas, as rubricas e o registro, que vai para a ficha do cliente e
// para a pasta dele no Drive.

const db = () => createAdminClient() as unknown as SupabaseClient;
const storage = () => createAdminClient().storage.from("documents");
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br").replace(/\/$/, "");
const CODIGO_MIN = 10;
const MAX_TENTATIVAS = 5;

export type Exige = { selfie?: boolean; documento?: boolean; certificado?: boolean };
export type LocalAssinatura = { gps?: { lat: number; lng: number; precisao: number | null } | null; ip?: LocalIp | null };

export type AssinaturaRow = {
  id: string;
  token_hash?: string | null;
  ata_id: string;
  versao: number;
  nome: string;
  papel: Participante["papel"];
  telefone: string | null;
  email: string | null;
  status: "pendente" | "assinada" | "correcao" | "recusada" | "cancelada";
  geracao: number;
  observador: boolean;
  ordem: number;
  exige: Exige;
  cpf: string | null;
  assinatura_path: string | null;
  assinatura_tipo: string | null;
  local: LocalAssinatura | null;
  selfie_path: string | null;
  documento_paths: { frente: string; verso: string | null } | null;
  verificacao: Verificacao | null;
  consentimento_biometria_em: string | null;
  certificado: Certificado | null;
  p7s_path: string | null;
  recusa: string | null;
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

export type AtaCompleta = AtaRow & {
  versao: number;
  aprovada_em: string | null;
  aprovada_por: string | null;
  pdf_cliente_path: string | null;
  pdf_hash: string | null;
  pdf_final_path: string | null;
  pdf_final_hash: string | null;
  codigo_validacao: string | null;
  ordem_assinatura: boolean;
  prazo_assinatura: string | null;
  lembretes_dias: number[];
  assinatura_via: "portal" | "zapsign";
  zapsign_token: string | null;
  carimbo: { tsa: string; serie: string; quando: string; politica: string | null; arquivo: string } | null;
  selo_escritorio: boolean;
};

export const hashToken = (token: string) => createHash("sha256").update(`ata:${token}`).digest("hex");

/**
 * O link de cada pessoa sai do id + geração (no banco só fica o hash). Links NOVOS
 * são sempre assinados com ATAS_SEGREDO (segredo só dos links). Os segredos que
 * valiam antes de 28/10/2026 (WA_MIDIA_SEGREDO/CRON_SECRET) só servem para
 * reconhecer links já enviados (reenvio e lembretes) — passando o hash guardado.
 */
function tokenDe(id: string, geracao: number, hashGuardado?: string | null): string {
  const atual = process.env.ATAS_SEGREDO;
  if (!atual) throw new Error("Falta o segredo dos links de assinatura (ATAS_SEGREDO).");
  const calcular = (segredo: string) => createHmac("sha256", segredo).update(`assinar:${id}:${geracao}`).digest("base64url").slice(0, 32);
  if (hashGuardado) {
    for (const segredo of [atual, process.env.WA_MIDIA_SEGREDO, process.env.CRON_SECRET]) {
      if (!segredo) continue;
      const t = calcular(segredo);
      if (hashToken(t) === hashGuardado) return t;
    }
  }
  return calcular(atual);
}
const hashCodigo = (id: string, codigo: string) => createHash("sha256").update(`${id}:${codigo}`).digest("hex");

/** Código de validação impresso no PDF (sem letras que confundem). */
function novoCodigoValidacao(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bloco = () => Array.from({ length: 4 }, () => letras[randomInt(letras.length)]).join("");
  return `${bloco()}-${bloco()}`;
}

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
const cpfFormatado = (c: string) => c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
export const pastaDaAta = (ata: Pick<AtaRow, "id" | "client_id">) => `internal/${ata.client_id ?? "escritorio"}/atas/${ata.id}`;

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

async function lerAta(id: string): Promise<AtaCompleta | null> {
  const { data } = await db().from("atas").select("*").eq("id", id).maybeSingle<AtaCompleta>();
  return data ?? null;
}

async function linhasDaVersao(ata: Pick<AtaCompleta, "id" | "versao">): Promise<AssinaturaRow[]> {
  const { data } = await db().from("ata_assinaturas").select("*").eq("ata_id", ata.id).eq("versao", ata.versao).neq("status", "cancelada").order("ordem").order("created_at");
  return (data ?? []) as AssinaturaRow[];
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
  const { data: r } = await db().from("responsaveis").select("telefone").eq("profile_id", ata.profile_id).maybeSingle();
  const { data: p } = await db().from("profiles").select("email").eq("id", ata.profile_id).maybeSingle();
  const tel = telefoneZap((r as { telefone: string | null } | null)?.telefone);
  const url = `${site()}/admin/atas/${ata.id}`;
  if (tel) await enfileirarMensagem({ para: tel, texto: `${texto}\n${url}`, origemRef: `ata:${ata.id}:dono` });
  else if (emailValido((p as { email: string } | null)?.email)) await mandarEmail((p as { email: string }).email, "Ata — MC Advogados", texto, { url, rotulo: "Abrir a ata" }).catch(() => {});
}

function descricaoDoDoc(dados: DadosAta) {
  return `${dados.titulo.toLowerCase()} de ${dataBr(dados.data_reuniao)}${dados.cliente ? ` (${dados.cliente})` : ""}`;
}

async function enviarLink(a: Pick<AssinaturaRow, "id" | "nome" | "telefone" | "email" | "observador" | "expira_em">, token: string, dados: DadosAta, lembrete = false): Promise<string[]> {
  const url = `${site()}/assinar/${token}`;
  const primeiro = a.nome.split(/\s+/)[0];
  const doc = descricaoDoDoc(dados);
  const ate = dataBr(a.expira_em);
  if (a.observador)
    return avisar(a, {
      zap: `*MC Advogados*\nOlá, ${primeiro}! Você foi incluído como observador da ${doc}. Acompanhe as assinaturas por este link:\n${url}`,
      assunto: "Ata para acompanhar — MC Advogados",
      email: `Olá, ${primeiro}!\nVocê foi incluído como observador da ${doc}. Você não precisa assinar: acompanhe as assinaturas e receba a cópia final pelo link abaixo.`,
      link: { url, rotulo: "Acompanhar a ata" },
      origem: `ata:${a.id}:link`,
    });
  const frase = lembrete ? `Lembrete: a ${doc} ainda aguarda a sua assinatura.` : `A ${doc} está pronta para sua conferência e assinatura.`;
  return avisar(a, {
    zap: `*MC Advogados*\nOlá, ${primeiro}! ${frase}\n\nConfira e assine por este link pessoal (vale até ${ate}):\n${url}`,
    assunto: lembrete ? `Lembrete: ata aguardando sua assinatura — MC Advogados` : `Ata para assinatura — MC Advogados`,
    email: `Olá, ${primeiro}!\n${frase}\nO link abaixo é pessoal e vale até ${ate}.`,
    link: { url, rotulo: "Conferir e assinar a ata" },
    origem: `ata:${a.id}:link`,
  });
}

/* ───────── aprovar e enviar ───────── */

export type Aprovador = { profileId: string; nome: string; ip: string | null; ua: string | null; assinaturaPng?: string | null; local?: LocalIp | null };
export type Signatario = Participante & { observador?: boolean; ordem?: number; exige?: Exige };
export type OpcoesEnvio = { ordem?: boolean; prazoDias?: number; lembretes?: number[] };

const PNG = /^data:image\/png;base64,/;
const JPEG = /^data:image\/jpeg;base64,/;
function decodificar(dataUrl: string, tipo: RegExp, maxBytes: number, oque: string): Buffer {
  if (!tipo.test(dataUrl)) throw new Error(`${oque}: formato inválido.`);
  const b = Buffer.from(dataUrl.replace(/^data:[^,]+,/, ""), "base64");
  if (!b.length) throw new Error(`${oque}: vazio.`);
  if (b.length > maxBytes) throw new Error(`${oque}: arquivo grande demais.`);
  return b;
}

/**
 * Aprova a ata: gera a versão para assinatura (sem as partes internas nas
 * reuniões com cliente), guarda o PDF com a impressão digital, registra a
 * assinatura de quem aprovou e manda o link para quem é da vez (ordem) e
 * para os observadores. Sem ninguém de fora, já fecha a ata.
 */
export async function aprovarEEnviar(ataId: string, aprovador: Aprovador, signatarios: Signatario[], opcoes: OpcoesEnvio = {}): Promise<{ enviados: { nome: string; via: string[] }[] }> {
  const ata = await lerAta(ataId);
  if (!ata) throw new Error("Ata não encontrada.");
  if (ata.status !== "rascunho") throw new Error("Só dá para aprovar uma ata em rascunho.");
  if (!ata.texto?.trim()) throw new Error("A ata está vazia.");
  const versao = ata.aprovada_em ? ata.versao + 1 : ata.versao;
  const dados = await dadosDaAta(ata);
  const paraCliente = TIPOS_ATA[ata.tipo].assinaCliente;
  const deFora = paraCliente ? signatarios.filter((s) => s.papel !== "escritorio" || s.observador) : signatarios;
  for (const s of deFora) if (!telefoneZap(s.telefone) && !emailValido(s.email)) throw new Error(`Falta o WhatsApp ou o e-mail de ${s.nome} para mandar o link.`);
  const prazoDias = Math.min(90, Math.max(1, Math.round(opcoes.prazoDias ?? 30)));
  const prazo = new Date(Date.now() + prazoDias * 86_400_000).toISOString();
  const lembretes = (opcoes.lembretes ?? [2, 5]).map((n) => Math.round(n)).filter((n) => n > 0 && n < prazoDias).slice(0, 6);
  const codigo = ata.codigo_validacao ?? novoCodigoValidacao();
  const assinaturaAprovador = aprovador.assinaturaPng ? decodificar(aprovador.assinaturaPng, PNG, 400_000, "Assinatura") : null;

  // versão que vai para assinatura (o bloco de assinaturas vai em branco)
  const assinantes: AssinanteNoPdf[] = [{ nome: aprovador.nome, papel: "Escritório" }, ...deFora.filter((s) => !s.observador).map((s) => ({ nome: s.nome, papel: PAPEL_ROTULO[s.papel] }))];
  const pdf = await pdfDaAta(dados, ata.texto, paraCliente ? "cliente" : "completa", { assinantes, codigo });
  const hash = sha256(pdf);
  const pasta = pastaDaAta(ata);
  const caminho = `${pasta}/v${versao}-para-assinatura.pdf`;
  const up = await storage().upload(caminho, pdf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`Não consegui guardar o PDF: ${up.error.message}`);

  // versões antigas deixam de valer
  await db().from("ata_assinaturas").update({ status: "cancelada" }).eq("ata_id", ata.id).eq("status", "pendente");
  await db()
    .from("atas")
    .update({
      status: "aguardando",
      versao,
      aprovada_por: aprovador.profileId,
      aprovada_em: new Date().toISOString(),
      pdf_cliente_path: caminho,
      pdf_hash: hash,
      codigo_validacao: codigo,
      ordem_assinatura: !!opcoes.ordem,
      prazo_assinatura: prazo,
      lembretes_dias: lembretes,
      correcao: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ata.id);
  const { data: minha } = await db()
    .from("ata_assinaturas")
    .insert({
      ata_id: ata.id,
      versao,
      nome: aprovador.nome,
      papel: "escritorio",
      ordem: 0,
      status: "assinada",
      assinado_em: new Date().toISOString(),
      assinado_via: "Aprovou a ata no Portal MC Advogados (acesso com login)",
      ip: aprovador.ip,
      user_agent: aprovador.ua,
      local: aprovador.local ? { ip: aprovador.local } : null,
    })
    .select("id")
    .single();
  if (minha && assinaturaAprovador) {
    const p = `${pasta}/assinaturas/${minha.id}/assinatura.png`;
    const u = await storage().upload(p, assinaturaAprovador, { contentType: "image/png", upsert: true });
    if (!u.error) await db().from("ata_assinaturas").update({ assinatura_path: p, assinatura_tipo: "desenho" }).eq("id", minha.id);
  }

  let n = 0;
  for (const s of deFora) {
    n++;
    await db().from("ata_assinaturas").insert({
      ata_id: ata.id,
      versao,
      nome: s.nome,
      papel: s.papel,
      telefone: telefoneZap(s.telefone),
      email: emailValido(s.email) ? s.email!.trim() : null,
      observador: !!s.observador,
      ordem: opcoes.ordem ? Math.max(1, Math.round(s.ordem ?? n)) : 1,
      exige: { selfie: !!s.exige?.selfie, documento: !!s.exige?.documento, certificado: !!s.exige?.certificado },
      expira_em: prazo,
    });
  }
  const enviados = await enviarDaVez(ata.id);
  if (ata.transcricao_id) await apagarAudio(ata.transcricao_id);
  await finalizarSeCompleta(ata.id);
  return { enviados };
}

/** Manda o link para quem é da vez (na ordem) e para os observadores que ainda não receberam. */
async function enviarDaVez(ataId: string): Promise<{ nome: string; via: string[] }[]> {
  const ata = await lerAta(ataId);
  if (!ata || ata.status !== "aguardando") return [];
  const linhas = await linhasDaVersao(ata);
  const pendentes = linhas.filter((l) => !l.observador && l.status === "pendente");
  const vez = ata.ordem_assinatura && pendentes.length ? Math.min(...pendentes.map((l) => l.ordem)) : null;
  const alvo = linhas.filter((l) => l.status === "pendente" && !l.enviado_em && (l.observador || vez === null || l.ordem === vez));
  const dados = await dadosDaAta(ata);
  const out: { nome: string; via: string[] }[] = [];
  for (const l of alvo) {
    const token = tokenDe(l.id, l.geracao);
    await db().from("ata_assinaturas").update({ token_hash: hashToken(token), enviado_em: new Date().toISOString() }).eq("id", l.id);
    out.push({ nome: l.nome, via: await enviarLink(l, token, dados) });
  }
  return out;
}

/** Link de assinatura de uma pessoa pendente (para copiar e mandar por onde quiser). */
export async function linkDeAssinatura(assinaturaId: string): Promise<string | null> {
  const { data: a } = await db().from("ata_assinaturas").select("id, geracao, status, link_externo, enviado_em, token_hash").eq("id", assinaturaId).maybeSingle();
  if (!a || a.status !== "pendente") return null;
  if (a.link_externo) return a.link_externo as string;
  if (!a.enviado_em) return null; // ainda não é a vez (ordem de assinatura)
  return `${site()}/assinar/${tokenDe(a.id as string, a.geracao as number, a.token_hash as string | null)}`;
}

/** Novo link para uma pessoa (o anterior para de funcionar). */
export async function reenviarLink(assinaturaId: string): Promise<string[]> {
  const { data: a } = await db().from("ata_assinaturas").select("*").eq("id", assinaturaId).single<AssinaturaRow>();
  if (!a || a.status !== "pendente") throw new Error("Essa assinatura não está pendente.");
  const ata = await lerAta(a.ata_id);
  if (!ata) throw new Error("Ata não encontrada.");
  const token = tokenDe(a.id, a.geracao + 1);
  const expira = ata.prazo_assinatura && Date.parse(ata.prazo_assinatura) > Date.now() ? ata.prazo_assinatura : new Date(Date.now() + 30 * 86_400_000).toISOString();
  await db()
    .from("ata_assinaturas")
    .update({ token_hash: hashToken(token), geracao: a.geracao + 1, tentativas: 0, codigo_hash: null, codigo_expira: null, enviado_em: new Date().toISOString(), expira_em: expira })
    .eq("id", a.id);
  return enviarLink({ ...a, expira_em: expira }, token, await dadosDaAta(ata));
}

/** Volta a ata para rascunho e cancela os links pendentes. */
export async function cancelarAssinaturas(ataId: string): Promise<void> {
  await db().from("ata_assinaturas").update({ status: "cancelada" }).eq("ata_id", ataId).eq("status", "pendente");
  await db().from("atas").update({ status: "rascunho", updated_at: new Date().toISOString() }).eq("id", ataId).eq("status", "aguardando");
}

/** Apaga do Storage tudo da ata (PDFs, assinaturas, selfies, documentos, .p7s). */
export async function apagarArquivosDaAta(ata: Pick<AtaRow, "id" | "client_id">): Promise<void> {
  const raiz = pastaDaAta(ata);
  const tudo: string[] = [];
  async function listar(pasta: string) {
    const { data } = await storage().list(pasta, { limit: 1000 });
    for (const f of data ?? []) {
      const p = `${pasta}/${f.name}`;
      if (f.id) tudo.push(p);
      else await listar(p);
    }
  }
  await listar(raiz);
  for (let i = 0; i < tudo.length; i += 100) await storage().remove(tudo.slice(i, i + 100));
}

/* ───────── página pública ───────── */

export type PaginaAssinatura = { assinatura: AssinaturaRow; ata: AtaCompleta; dados: DadosAta; vencido: boolean; daVez: boolean };

export async function abrirPorToken(token: string): Promise<PaginaAssinatura | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const { data: a } = await db().from("ata_assinaturas").select("*").eq("token_hash", hashToken(token)).maybeSingle<AssinaturaRow>();
  if (!a) return null;
  const ata = await lerAta(a.ata_id);
  if (!ata) return null;
  let daVez = true;
  if (ata.ordem_assinatura && !a.observador && a.status === "pendente") {
    const linhas = await linhasDaVersao(ata);
    daVez = !linhas.some((l) => !l.observador && l.status === "pendente" && l.ordem < a.ordem);
  }
  return { assinatura: a, ata, dados: await dadosDaAta(ata), vencido: vencida(a), daVez };
}

const travada = (a: AssinaturaRow) => a.tentativas >= MAX_TENTATIVAS;
const vencida = (a: AssinaturaRow) => new Date(a.expira_em).getTime() < Date.now();

/** Confere que o link pode assinar agora (pendente, no prazo, é a vez, não é observador). */
async function podeAssinar(token: string): Promise<PaginaAssinatura> {
  const p = await abrirPorToken(token);
  if (!p) throw new Error("Link inválido.");
  const { assinatura: a, ata } = p;
  if (a.observador) throw new Error("Você está como observador desta ata: não precisa assinar.");
  if (a.status !== "pendente" || ata.status !== "aguardando" || a.versao !== ata.versao) throw new Error("Esta ata não está mais aguardando a sua assinatura.");
  if (p.vencido) throw new Error("O prazo para assinar venceu. Peça um novo link ao escritório.");
  if (travada(a)) throw new Error("Muitas tentativas erradas. Peça um novo link ao escritório.");
  if (!p.daVez) throw new Error("Ainda não é a sua vez: esta ata tem ordem de assinatura.");
  return p;
}

const pastaDaPessoa = (p: PaginaAssinatura) => `${pastaDaAta(p.ata)}/assinaturas/${p.assinatura.id}`;

/** Assinatura desenhada ou digitada (PNG transparente feito no navegador). */
export async function salvarAssinaturaDesenho(token: string, png: string, tipo: "desenho" | "digitada"): Promise<void> {
  const p = await podeAssinar(token);
  const bytes = decodificar(png, PNG, 400_000, "Assinatura");
  const caminho = `${pastaDaPessoa(p)}/assinatura.png`;
  const up = await storage().upload(caminho, bytes, { contentType: "image/png", upsert: true });
  if (up.error) throw new Error("Não consegui guardar a assinatura. Tente de novo.");
  await db().from("ata_assinaturas").update({ assinatura_path: caminho, assinatura_tipo: tipo === "digitada" ? "digitada" : "desenho" }).eq("id", p.assinatura.id);
}

export async function salvarSelfie(token: string, jpeg: string): Promise<void> {
  const p = await podeAssinar(token);
  const bytes = decodificar(jpeg, JPEG, 3_000_000, "Selfie");
  const caminho = `${pastaDaPessoa(p)}/selfie.jpg`;
  const up = await storage().upload(caminho, bytes, { contentType: "image/jpeg", upsert: true });
  if (up.error) throw new Error("Não consegui guardar a selfie. Tente de novo.");
  await db().from("ata_assinaturas").update({ selfie_path: caminho, verificacao: null, consentimento_biometria_em: new Date().toISOString() }).eq("id", p.assinatura.id);
}

export async function salvarDocumento(token: string, frente: string, verso: string | null, cpf: string | null): Promise<void> {
  const p = await podeAssinar(token);
  const f = decodificar(frente, JPEG, 3_000_000, "Frente do documento");
  const v = verso ? decodificar(verso, JPEG, 3_000_000, "Verso do documento") : null;
  const base = pastaDaPessoa(p);
  const up1 = await storage().upload(`${base}/documento-frente.jpg`, f, { contentType: "image/jpeg", upsert: true });
  const up2 = v ? await storage().upload(`${base}/documento-verso.jpg`, v, { contentType: "image/jpeg", upsert: true }) : { error: null };
  if (up1.error || up2.error) throw new Error("Não consegui guardar o documento. Tente de novo.");
  const digitos = (cpf ?? "").replace(/\D/g, "");
  await db()
    .from("ata_assinaturas")
    .update({
      documento_paths: { frente: `${base}/documento-frente.jpg`, verso: v ? `${base}/documento-verso.jpg` : null },
      verificacao: null,
      consentimento_biometria_em: new Date().toISOString(),
      ...(digitos.length === 11 ? { cpf: digitos } : {}),
    })
    .eq("id", p.assinatura.id);
}

export async function salvarGps(token: string, gps: { lat: number; lng: number; precisao: number | null }): Promise<void> {
  const p = await podeAssinar(token);
  const ok = Number.isFinite(gps.lat) && Number.isFinite(gps.lng) && Math.abs(gps.lat) <= 90 && Math.abs(gps.lng) <= 180;
  if (!ok) return;
  const local: LocalAssinatura = { ...(p.assinatura.local ?? {}), gps: { lat: Math.round(gps.lat * 1e5) / 1e5, lng: Math.round(gps.lng * 1e5) / 1e5, precisao: gps.precisao ? Math.round(gps.precisao) : null } };
  await db().from("ata_assinaturas").update({ local }).eq("id", p.assinatura.id);
}

/** Certificado A1: confere a assinatura destacada (.p7s) contra o PDF exato da ata e guarda. */
export async function salvarCertificado(token: string, p7sBase64: string): Promise<Certificado> {
  const p = await podeAssinar(token);
  const der = Buffer.from(p7sBase64, "base64");
  if (!der.length || der.length > 200_000) throw new Error("Arquivo de assinatura inválido.");
  const cert = conferirCertificado(der, p.ata.pdf_hash ?? "");
  const caminho = `${pastaDaPessoa(p)}/assinatura-digital.p7s`;
  const up = await storage().upload(caminho, der, { contentType: "application/pkcs7-signature", upsert: true });
  if (up.error) throw new Error("Não consegui guardar a assinatura digital. Tente de novo.");
  await db()
    .from("ata_assinaturas")
    .update({ certificado: cert, p7s_path: caminho, ...(cert.cpf && !p.assinatura.cpf ? { cpf: cert.cpf } : {}) })
    .eq("id", p.assinatura.id);
  return cert;
}

/** Manda o código de 6 dígitos (zap ou e-mail). */
export async function pedirCodigo(token: string, canal: "zap" | "email"): Promise<{ destino: string }> {
  const { assinatura: a } = await podeAssinar(token);
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

async function baixar(caminho: string | null | undefined): Promise<Buffer | null> {
  if (!caminho) return null;
  const { data } = await storage().download(caminho);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

/** Confere o código, o que foi exigido, e registra a assinatura. */
export async function assinarComCodigo(token: string, codigo: string, meta: { ip: string | null; ua: string | null; local: LocalIp | null }): Promise<{ completa: boolean }> {
  const p = await abrirPorToken(token);
  if (p?.assinatura.status === "assinada") return { completa: p.ata.status === "assinada" };
  const { assinatura: a, ata } = await podeAssinar(token);
  const ex = a.exige ?? {};
  if (!a.assinatura_path) throw new Error("Faça a sua assinatura antes de confirmar.");
  if (ex.selfie && !a.selfie_path) throw new Error("Falta a selfie.");
  if (ex.documento && !a.documento_paths) throw new Error("Falta a foto do documento.");
  if (ex.certificado && !a.certificado) throw new Error("Falta assinar com o certificado digital.");
  if (!a.codigo_hash || !a.codigo_expira || new Date(a.codigo_expira).getTime() < Date.now()) throw new Error("O código venceu. Peça outro.");
  if (hashCodigo(a.id, codigo.replace(/\D/g, "")) !== a.codigo_hash) {
    await db().from("ata_assinaturas").update({ tentativas: a.tentativas + 1 }).eq("id", a.id);
    const restam = MAX_TENTATIVAS - a.tentativas - 1;
    throw new Error(restam > 0 ? `Código errado. Restam ${restam} tentativa(s).` : "Código errado. O link foi travado: peça um novo ao escritório.");
  }
  // conferência da IA (selfie × documento), se ainda não foi feita
  let verificacao = a.verificacao;
  if (a.selfie_path && a.documento_paths && !verificacao) {
    const [selfie, frente, verso] = await Promise.all([baixar(a.selfie_path), baixar(a.documento_paths.frente), baixar(a.documento_paths.verso)]);
    if (selfie && frente) verificacao = await conferirIdentidade({ selfie, frente, verso }, { nome: a.nome, cpf: a.cpf });
  }
  await db()
    .from("ata_assinaturas")
    .update({
      status: "assinada",
      assinado_em: new Date().toISOString(),
      assinado_via: `Código confirmado por ${a.codigo_destino}`,
      ip: meta.ip,
      user_agent: meta.ua,
      local: { ...(a.local ?? {}), ip: meta.local },
      verificacao,
      codigo_hash: null,
    })
    .eq("id", a.id);
  if (verificacao && (verificacao.mesma_pessoa === "nao" || verificacao.nome_confere === false || verificacao.cpf_confere === false))
    await avisarDono(ata, `⚠️ ${a.nome} assinou a ata "${ata.titulo}", mas a conferência da IA da selfie/documento pediu atenção. Confira na ata.`).catch(() => {});
  await enviarDaVez(ata.id);
  return { completa: await finalizarSeCompleta(ata.id) };
}

/** A pessoa pede correção: a ata volta para rascunho e o dono é avisado. */
export async function pedirCorrecao(token: string, texto: string): Promise<void> {
  const { assinatura: a, ata } = await podeAssinar(token);
  const pedido = texto.trim().slice(0, 2000);
  if (pedido.length < 3) throw new Error("Escreva o que precisa ser corrigido.");
  await db().from("ata_assinaturas").update({ status: "correcao", correcao: pedido }).eq("id", a.id);
  await db().from("ata_assinaturas").update({ status: "cancelada" }).eq("ata_id", ata.id).eq("status", "pendente");
  await db().from("atas").update({ status: "rascunho", correcao: `${a.nome}: ${pedido}`, updated_at: new Date().toISOString() }).eq("id", ata.id);
  await avisarDono(ata, `✏️ ${a.nome} pediu correção na ata "${ata.titulo}":\n"${pedido}"\nCorrija e aprove de novo (os outros assinam a nova versão).`);
}

/** A pessoa recusa assinar (com motivo): a ata volta para rascunho e o dono é avisado. */
export async function recusar(token: string, motivo: string): Promise<void> {
  const { assinatura: a, ata } = await podeAssinar(token);
  const m = motivo.trim().slice(0, 2000);
  if (m.length < 3) throw new Error("Diga o motivo da recusa.");
  await db().from("ata_assinaturas").update({ status: "recusada", recusa: m }).eq("id", a.id);
  await db().from("ata_assinaturas").update({ status: "cancelada" }).eq("ata_id", ata.id).eq("status", "pendente");
  await db().from("atas").update({ status: "rascunho", correcao: `${a.nome} RECUSOU assinar: ${m}`, updated_at: new Date().toISOString() }).eq("id", ata.id);
  await avisarDono(ata, `⛔ ${a.nome} recusou assinar a ata "${ata.titulo}":\n"${m}"`);
}

/* ───────── fechamento ───────── */

const aparelho = (ua: string | null) => {
  if (!ua) return null;
  const so = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [so, nav].filter(Boolean).join(" / ") || null;
};

export function localLegivel(l: LocalAssinatura | null): string | null {
  if (!l) return null;
  const ip = l.ip ? [l.ip.cidade, l.ip.uf, l.ip.pais].filter(Boolean).join("/") : "";
  const gps = l.gps ? `GPS ${l.gps.lat.toFixed(5)}, ${l.gps.lng.toFixed(5)}${l.gps.precisao ? ` (±${l.gps.precisao} m)` : ""}` : "";
  return [ip ? `${ip} (pelo IP)` : "", gps].filter(Boolean).join(" · ") || null;
}

export function extrasDoRegistro(l: AssinaturaRow): string[] {
  const out: string[] = [];
  if (l.assinatura_tipo) out.push(l.assinatura_tipo === "digitada" ? "Assinatura digitada (nome em letra cursiva)" : "Assinatura desenhada na tela");
  if (l.selfie_path) {
    const v = l.verificacao;
    const ia = v ? (v.mesma_pessoa === "sim" ? "mesma pessoa do documento" : v.mesma_pessoa === "nao" ? "rosto DIFERENTE do documento" : "inconclusiva") : null;
    out.push(`Selfie registrada${ia && l.documento_paths ? ` — conferência da IA: ${ia}` : ""}`);
  }
  if (l.documento_paths) {
    const v = l.verificacao;
    const partes = [v?.tipo_documento ? `${v.tipo_documento}` : "identidade", v?.nome_confere ? "nome confere" : v?.nome_confere === false ? "nome NÃO confere" : "", v?.cpf_confere ? "CPF confere" : v?.cpf_confere === false ? "CPF NÃO confere" : ""].filter(Boolean);
    out.push(`Documento com foto registrado (${partes.join(" · ")})`);
  }
  if (l.certificado) {
    const c = l.certificado;
    out.push(`Certificado digital${c.icp_brasil ? " ICP-Brasil" : ""}: ${c.titular}${c.cpf ? ` (CPF ${cpfFormatado(c.cpf)})` : ""}, emitido por ${c.emissor}, série ${c.serie}, válido até ${dataBr(c.valido_ate)} — assinatura destacada .p7s`);
  }
  return out;
}

/** Se todos da versão atual assinaram: PDF final, ficha do cliente, Drive e avisos. */
export async function finalizarSeCompleta(ataId: string): Promise<boolean> {
  const ata = await lerAta(ataId);
  if (!ata || ata.status !== "aguardando") return ata?.status === "assinada";
  const todas = await linhasDaVersao(ata);
  const assinam = todas.filter((l) => !l.observador);
  if (!assinam.length || assinam.some((l) => l.status !== "assinada")) return false;

  const dados = await dadosDaAta(ata);
  const paraCliente = TIPOS_ATA[ata.tipo].assinaCliente;
  const imagens = await Promise.all(assinam.map((l) => baixar(l.assinatura_path)));
  const documento = `${dados.titulo}${dados.cliente ? ` — ${dados.cliente}` : ""} — ${dataBr(dados.data_reuniao)} — versão ${ata.versao}`;
  // carimbo do tempo do conteúdo assinado (autoridade independente; se falhar, segue sem)
  const carimbo = ata.pdf_hash ? await carimbar(ata.pdf_hash) : null;
  let carimboInfo: { tsa: string; serie: string; quando: string; politica: string | null; arquivo: string } | null = null;
  if (carimbo) {
    const arq = `${pastaDaAta(ata)}/v${ata.versao}-carimbo.tsr`;
    const up = await storage().upload(arq, carimbo.tsr, { contentType: "application/timestamp-reply", upsert: true });
    if (!up.error) carimboInfo = { tsa: carimbo.tsa, serie: carimbo.serie, quando: carimbo.quando, politica: carimbo.politica, arquivo: arq };
  }
  const selo = titularDoSelo();
  const registro: Registro = {
    documento,
    carimbo: carimbo ? { quando: `${dataHoraBr(carimbo.quando)} (horário de Brasília)`, tsa: carimbo.tsa, serie: carimbo.serie } : null,
    selo,
    hash: ata.pdf_hash ?? "",
    assinaturas: assinam.map(
      (l, i): RegistroAssinatura => ({
        nome: l.nome,
        papel: PAPEL_ROTULO[l.papel],
        cpf: l.cpf ? cpfFormatado(l.cpf) : null,
        quando: `${dataHoraBr(l.assinado_em!)} (horário de Brasília)`,
        via: l.assinado_via ?? "",
        ip: l.ip,
        aparelho: aparelho(l.user_agent),
        local: localLegivel(l.local),
        extras: extrasDoRegistro(l),
        img: imagens[i],
      })
    ),
  };
  const assinantes: AssinanteNoPdf[] = assinam.map((l, i) => ({ nome: l.nome, papel: PAPEL_ROTULO[l.papel], img: imagens[i], quando: dataHoraBr(l.assinado_em!) }));
  const rubricas = imagens.filter((b): b is Buffer => !!b);
  const montado = await pdfDaAta(dados, ata.texto, paraCliente ? "cliente" : "completa", { registro, assinantes, rubricas, codigo: ata.codigo_validacao });
  // selo PAdES do escritório (só quando o certificado A1 estiver configurado)
  const selado = selo ? await selar(montado, `${documento} — assinada no Portal MC Advogados`) : null;
  const pdf = selado ?? montado;
  const caminho = `${pastaDaAta(ata)}/v${ata.versao}-assinada.pdf`;
  const up = await storage().upload(caminho, pdf, { contentType: "application/pdf", upsert: true });
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
  await db()
    .from("atas")
    .update({ status: "assinada", pdf_final_path: caminho, pdf_final_hash: sha256(pdf), document_id: documentId, carimbo: carimboInfo, selo_escritorio: !!selado, updated_at: new Date().toISOString() })
    .eq("id", ata.id);

  // cada pessoa de fora (e observador) recebe o aviso: a cópia fica no mesmo link
  for (const l of todas.filter((x) => x.papel !== "escritorio" || x.observador)) {
    await avisar(l, {
      zap: `*MC Advogados*\nA ${descricaoDoDoc(dados)} foi assinada por todos. A cópia assinada fica no mesmo link que você recebeu.\nCódigo de validação: ${ata.codigo_validacao}`,
      assunto: "Ata assinada por todos — MC Advogados",
      email: `A ${descricaoDoDoc(dados)} foi assinada por todos. A cópia assinada fica disponível no mesmo link que você recebeu.\nCódigo de validação: ${ata.codigo_validacao} (confira em ${site()}/validar).`,
      origem: `ata:${l.id}:fim`,
    }).catch(() => []);
  }
  if (assinam.some((l) => l.papel !== "escritorio")) await avisarDono(ata, `✅ A ata "${ata.titulo}" foi assinada por todos.`).catch(() => {});
  return true;
}

/* ───────── lembretes (cron diário) ───────── */

/** Nos dias marcados na ata (padrão 2 e 5), lembra quem é da vez e não assinou; depois avisa o dono uma vez. */
export async function lembrarAssinaturas(): Promise<{ lembretes: number; avisos: number }> {
  const { data } = await db().from("ata_assinaturas").select("*").eq("status", "pendente").eq("observador", false).not("enviado_em", "is", null).limit(300);
  let lembretes = 0;
  let avisos = 0;
  const atas = new Map<string, AtaCompleta | null>();
  for (const a of (data ?? []) as AssinaturaRow[]) {
    if (!atas.has(a.ata_id)) atas.set(a.ata_id, await lerAta(a.ata_id));
    const ata = atas.get(a.ata_id);
    if (!ata || ata.status !== "aguardando" || ata.versao !== a.versao || vencida(a)) continue;
    const dias = (Date.now() - new Date(a.enviado_em!).getTime()) / 86_400_000;
    const marcos = ata.lembretes_dias ?? [2, 5];
    if (a.lembretes < marcos.length && dias >= marcos[a.lembretes]) {
      // o mesmo link de antes (sai do id + geração)
      await db().from("ata_assinaturas").update({ lembretes: a.lembretes + 1, ultimo_lembrete: new Date().toISOString() }).eq("id", a.id);
      await enviarLink(a, tokenDe(a.id, a.geracao, a.token_hash), await dadosDaAta(ata), true);
      lembretes++;
    } else if (a.lembretes === marcos.length && dias >= (marcos.at(-1) ?? 5) + 2) {
      await db().from("ata_assinaturas").update({ lembretes: a.lembretes + 1 }).eq("id", a.id);
      await avisarDono(ata, `⏳ ${a.nome} ainda não assinou a ata "${ata.titulo}" (enviada há ${Math.floor(dias)} dias${marcos.length ? `, com ${marcos.length} lembrete(s)` : ""}).`);
      avisos++;
    }
  }
  return { lembretes, avisos };
}

/* ───────── validação pública ───────── */

export type Validacao = {
  documento: string;
  situacao: string;
  codigo: string | null;
  carimbo: string | null;
  selado: boolean;
  confere: "final" | "para_assinatura" | null;
  assinaturas: { nome: string; papel: string; quando: string | null; autenticacoes: string[] }[];
};

/** Pelo código impresso no PDF ou pela impressão digital (SHA-256) do arquivo. */
export async function validarDocumento({ codigo, hash }: { codigo?: string; hash?: string }): Promise<Validacao | null> {
  let q = db().from("atas").select("*").limit(1);
  const c = (codigo ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const h = (hash ?? "").toLowerCase();
  if (c.length === 8) q = q.eq("codigo_validacao", `${c.slice(0, 4)}-${c.slice(4)}`);
  else if (/^[0-9a-f]{64}$/.test(h)) q = q.or(`pdf_final_hash.eq.${h},pdf_hash.eq.${h}`);
  else return null;
  const { data } = await q;
  const ata = (data?.[0] as AtaCompleta | undefined) ?? null;
  if (!ata || !ata.aprovada_em) return null;
  const dados = await dadosDaAta(ata);
  const linhas = (await linhasDaVersao(ata)).filter((l) => !l.observador);
  return {
    documento: `${dados.titulo} — ${dataBr(dados.data_reuniao)} — versão ${ata.versao}`,
    situacao: ata.status === "assinada" ? "Assinada por todos" : ata.status === "aguardando" ? "Aguardando assinaturas" : "Em revisão (versão anterior)",
    codigo: ata.codigo_validacao,
    carimbo: ata.carimbo ? `${dataHoraBr(ata.carimbo.quando)} — ${ata.carimbo.tsa}` : null,
    selado: !!ata.selo_escritorio,
    confere: h ? (h === ata.pdf_final_hash ? "final" : h === ata.pdf_hash ? "para_assinatura" : null) : null,
    assinaturas: linhas.map((l) => ({
      nome: l.nome,
      papel: PAPEL_ROTULO[l.papel],
      quando: l.assinado_em ? dataHoraBr(l.assinado_em) : null,
      autenticacoes: l.status === "assinada" ? [l.papel === "escritorio" && !l.codigo_destino ? "Login no portal" : "Código", l.selfie_path ? "Selfie" : "", l.documento_paths ? "Documento" : "", l.certificado ? "Certificado digital" : ""].filter(Boolean) : [],
    })),
  };
}
