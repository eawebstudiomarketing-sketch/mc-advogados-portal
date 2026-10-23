import "server-only";
import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";

// Selo do escritório (PAdES): o PDF final da ata sai assinado digitalmente
// com o certificado A1 do escritório — o Adobe mostra "Assinado por …" e
// qualquer alteração depois invalida o selo. Liga sozinho quando o
// certificado estiver no Vercel: ATAS_CERT_PFX_BASE64 (o .pfx em base64) e
// ATAS_CERT_SENHA. Sem eles, o PDF sai como antes.

function certificado(): { pfx: Buffer; senha: string } | null {
  const b64 = process.env.ATAS_CERT_PFX_BASE64;
  if (!b64) return null;
  return { pfx: Buffer.from(b64, "base64"), senha: process.env.ATAS_CERT_SENHA ?? "" };
}

/** Nome do titular do certificado do escritório (ou null se não houver). */
export function titularDoSelo(): string | null {
  const c = certificado();
  if (!c) return null;
  try {
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(c.pfx.toString("binary")), c.senha);
    const cert = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])[0]?.cert;
    const cn = cert?.subject.getField("CN")?.value as string | undefined;
    return cn ? cn.split(":")[0].trim() : "MC Advogados";
  } catch {
    return null;
  }
}

/** Sela o PDF com o certificado do escritório. Devolve null se não houver certificado ou se falhar. */
export async function selar(pdf: Buffer, motivo: string): Promise<Buffer | null> {
  const c = certificado();
  if (!c) return null;
  try {
    const doc = await PDFDocument.load(pdf);
    pdflibAddPlaceholder({ pdfDoc: doc, reason: motivo, contactInfo: "mcadvogados.app.br", name: titularDoSelo() ?? "MC Advogados", location: "Teixeira de Freitas/BA" });
    const comEspaco = Buffer.from(await doc.save({ useObjectStreams: false }));
    return Buffer.from(await new SignPdf().sign(comEspaco, new P12Signer(c.pfx, { passphrase: c.senha })));
  } catch (e) {
    console.error("selo do escritório:", e instanceof Error ? e.message : e);
    return null;
  }
}
