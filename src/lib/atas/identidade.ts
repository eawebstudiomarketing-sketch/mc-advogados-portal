import "server-only";
import { X509Certificate, createPublicKey, verify as verificarRsa } from "node:crypto";
import forge from "node-forge";
import { ApiError, GoogleGenAI } from "@google/genai";
import { MODELOS } from "@/lib/ia-modelos";
import { registrarUsoIA } from "@/lib/ia-uso";

// Identidade de quem assina uma ata: local pelo IP (cabeçalhos do Vercel),
// conferência da selfie com o documento pela IA e o certificado digital A1
// (assinatura destacada CMS/.p7s feita no navegador: a senha e o arquivo do
// certificado nunca saem do aparelho da pessoa).

export type LocalIp = { cidade: string | null; uf: string | null; pais: string | null };

/** Cidade/UF/país do IP (o Vercel manda nos cabeçalhos; no PC local vem vazio). */
export function localPeloIp(h: Headers): LocalIp | null {
  const dec = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  const l = { cidade: dec(h.get("x-vercel-ip-city")), uf: dec(h.get("x-vercel-ip-country-region")), pais: dec(h.get("x-vercel-ip-country")) };
  return l.cidade || l.uf || l.pais ? l : null;
}

export const ipDe = (h: Headers) => h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;

/* ───────── selfie × documento ───────── */

export type Verificacao = {
  mesma_pessoa: "sim" | "nao" | "incerto";
  nome_no_documento: string | null;
  cpf_no_documento: string | null;
  tipo_documento: string | null;
  nome_confere: boolean | null;
  cpf_confere: boolean | null;
  legivel: boolean;
  observacao: string | null;
  em: string;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
/** Nome do cadastro dentro do nome do documento (aceita abreviação do meio). */
function nomeConfere(esperado: string, lido: string): boolean {
  const a = semAcento(esperado).split(" ").filter((p) => p.length > 2);
  const b = semAcento(lido);
  if (!a.length || !b) return false;
  const achados = a.filter((p) => b.includes(p)).length;
  return achados >= Math.min(2, a.length) && b.startsWith(a[0]);
}

/** A IA compara a selfie com a foto do documento e lê nome/CPF. Apoio ao advogado: não trava a assinatura. */
export async function conferirIdentidade(
  imagens: { selfie: Buffer; frente: Buffer; verso?: Buffer | null },
  esperado: { nome: string; cpf?: string | null }
): Promise<Verificacao> {
  const apiKey = process.env.GEMINI_API_KEY;
  const em = new Date().toISOString();
  const vazio: Verificacao = { mesma_pessoa: "incerto", nome_no_documento: null, cpf_no_documento: null, tipo_documento: null, nome_confere: null, cpf_confere: null, legivel: false, observacao: null, em };
  if (!apiKey) return { ...vazio, observacao: "IA não configurada." };
  const ai = new GoogleGenAI({ apiKey });
  const img = (b: Buffer) => ({ inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } });
  try {
    const r = await ai.models.generateContent({
      model: MODELOS.transcricao,
      contents: [
        {
          role: "user",
          parts: [
            { text: "Imagem 1: selfie tirada agora por quem está assinando um documento." },
            img(imagens.selfie),
            { text: "Imagem 2: foto do documento de identidade (frente)." },
            img(imagens.frente),
            ...(imagens.verso ? [{ text: "Imagem 3: verso do documento." }, img(imagens.verso)] : []),
            {
              text: `Confira a identidade para um registro de assinatura eletrônica. Responda SÓ com JSON:
{"mesma_pessoa": "sim" | "nao" | "incerto" (o rosto da selfie é a mesma pessoa da foto do documento?),
 "tipo_documento": "RG" | "CNH" | "CIN" | "passaporte" | "outro" | null,
 "nome_no_documento": "nome completo como está no documento" | null,
 "cpf_no_documento": "só dígitos" | null,
 "legivel": true | false (o documento está legível e parece um documento de identidade real, não uma tela/foto de foto?),
 "observacao": "uma frase curta se algo chamar atenção, senão null"}`,
            },
          ],
        },
      ],
      config: { temperature: 0, maxOutputTokens: 600 },
    });
    await registrarUsoIA("ata_identidade", MODELOS.transcricao, r.usageMetadata);
    const t = r.text ?? "";
    const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)) as Partial<Verificacao>;
    const cpfLido = (j.cpf_no_documento ?? "").replace(/\D/g, "") || null;
    const cpfEsperado = (esperado.cpf ?? "").replace(/\D/g, "") || null;
    return {
      mesma_pessoa: j.mesma_pessoa === "sim" || j.mesma_pessoa === "nao" ? j.mesma_pessoa : "incerto",
      tipo_documento: j.tipo_documento ?? null,
      nome_no_documento: j.nome_no_documento ?? null,
      cpf_no_documento: cpfLido,
      nome_confere: j.nome_no_documento ? nomeConfere(esperado.nome, j.nome_no_documento) : null,
      cpf_confere: cpfLido && cpfEsperado ? cpfLido === cpfEsperado : null,
      legivel: !!j.legivel,
      observacao: j.observacao ? String(j.observacao).slice(0, 300) : null,
      em,
    };
  } catch (e) {
    console.error("conferência de identidade:", e instanceof ApiError ? e.status : e instanceof Error ? e.message : e);
    return { ...vazio, observacao: "Não deu para conferir pela IA agora." };
  }
}

/* ───────── certificado digital (CMS destacado) ───────── */

export type Certificado = {
  titular: string;
  cpf: string | null;
  emissor: string;
  icp_brasil: boolean;
  serie: string;
  valido_de: string;
  valido_ate: string;
  assinado_em: string | null;
};

const OID_MESSAGE_DIGEST = forge.pki.oids.messageDigest;
const OID_SIGNING_TIME = forge.pki.oids.signingTime;

/**
 * Confere a assinatura destacada (.p7s) feita no navegador: o resumo assinado
 * tem de ser o do PDF da ata (SHA-256) e a assinatura RSA tem de bater com o
 * certificado (conferida com a criptografia do Node, não com a do forge).
 */
export function conferirCertificado(p7sDer: Buffer, hashPdfHex: string): Certificado {
  let msg: forge.pkcs7.PkcsSignedData;
  try {
    msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(p7sDer.toString("binary")))) as forge.pkcs7.PkcsSignedData;
  } catch {
    throw new Error("O arquivo de assinatura veio corrompido.");
  }
  const cru = (msg as unknown as { rawCapture: { authenticatedAttributes?: forge.asn1.Asn1[]; signature: string; digestAlgorithm: string } }).rawCapture;
  const atributos = cru.authenticatedAttributes;
  if (!atributos?.length) throw new Error("Assinatura sem atributos assinados.");
  let resumo: string | null = null;
  let quando: string | null = null;
  for (const at of atributos) {
    const partes = at.value as forge.asn1.Asn1[];
    const oid = forge.asn1.derToOid(partes[0].value as string);
    const valor = (partes[1].value as forge.asn1.Asn1[])[0];
    if (oid === OID_MESSAGE_DIGEST) resumo = forge.util.bytesToHex(valor.value as string);
    if (oid === OID_SIGNING_TIME) {
      try {
        quando = forge.asn1.utcTimeToDate(valor.value as string).toISOString();
      } catch {
        quando = null;
      }
    }
  }
  if (!resumo || resumo.toLowerCase() !== hashPdfHex.toLowerCase()) throw new Error("A assinatura digital não é deste documento.");
  if (forge.asn1.derToOid(cru.digestAlgorithm) !== forge.pki.oids.sha256) throw new Error("Use um certificado com SHA-256.");

  const certForge = msg.certificates[0];
  if (!certForge) throw new Error("O certificado não veio junto com a assinatura.");
  const pem = forge.pki.certificateToPem(certForge);
  const cert = new X509Certificate(pem);
  // os atributos assinados são conferidos como SET (DER), como manda o CMS
  const setDer = Buffer.from(forge.asn1.toDer(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, atributos)).getBytes(), "binary");
  const ok = verificarRsa("sha256", setDer, createPublicKey(pem), Buffer.from(cru.signature, "binary"));
  if (!ok) throw new Error("A assinatura digital não confere com o certificado.");
  const agora = Date.now();
  if (agora < Date.parse(cert.validFrom) || agora > Date.parse(cert.validTo)) throw new Error("O certificado está vencido ou ainda não vale.");

  const cn = (certForge.subject.getField("CN")?.value as string | undefined) ?? cert.subject;
  const [titular, cpfCn] = cn.split(":");
  const emissorCn = (certForge.issuer.getField("CN")?.value as string | undefined) ?? cert.issuer;
  // ICP-Brasil = o emissor é uma AC da ICP-Brasil (O=ICP-Brasil). A cadeia
  // completa até a raiz do ITI se confere em validar.iti.gov.br com o .p7s.
  const icp = /^ICP-Brasil$/i.test(String(certForge.issuer.getField("O")?.value ?? "").trim());
  return {
    titular: titular.trim(),
    cpf: cpfCn && /^\d{11}$/.test(cpfCn.trim()) ? cpfCn.trim() : null,
    emissor: emissorCn,
    icp_brasil: icp,
    serie: cert.serialNumber,
    valido_de: new Date(cert.validFrom).toISOString(),
    valido_ate: new Date(cert.validTo).toISOString(),
    assinado_em: quando,
  };
}
