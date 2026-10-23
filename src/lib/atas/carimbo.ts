import "server-only";
import { randomBytes } from "node:crypto";
import forge from "node-forge";

// Carimbo do tempo (RFC 3161): uma autoridade de carimbo independente assina
// "este resumo SHA-256 existia neste instante". Prova a data sem depender do
// relógio do nosso servidor. Padrão: DigiCert (gratuita, usada no mundo todo);
// dá para trocar por uma ACT ICP-Brasil em ATAS_TSA_URL. O arquivo .tsr pode
// ser conferido com `openssl ts -verify`.

const TSA_PADRAO = "http://timestamp.digicert.com";

export type Carimbo = { tsa: string; serie: string; quando: string; politica: string | null; tsr: Buffer };

const A = forge.asn1;

function pedido(hashHex: string, nonce: Buffer): Buffer {
  const req = A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [
    A.create(A.Class.UNIVERSAL, A.Type.INTEGER, false, A.integerToDer(1).getBytes()),
    A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [
      A.create(A.Class.UNIVERSAL, A.Type.SEQUENCE, true, [
        A.create(A.Class.UNIVERSAL, A.Type.OID, false, A.oidToDer(forge.pki.oids.sha256).getBytes()),
        A.create(A.Class.UNIVERSAL, A.Type.NULL, false, ""),
      ]),
      A.create(A.Class.UNIVERSAL, A.Type.OCTETSTRING, false, forge.util.hexToBytes(hashHex)),
    ]),
    A.create(A.Class.UNIVERSAL, A.Type.INTEGER, false, nonce.toString("binary")),
    A.create(A.Class.UNIVERSAL, A.Type.BOOLEAN, false, String.fromCharCode(0xff)),
  ]);
  return Buffer.from(A.toDer(req).getBytes(), "binary");
}

const filhos = (n: forge.asn1.Asn1) => n.value as forge.asn1.Asn1[];

/** Pede o carimbo do resumo SHA-256 (hex). Devolve null se a autoridade não responder (não trava a ata). */
export async function carimbar(hashHex: string): Promise<Carimbo | null> {
  const url = process.env.ATAS_TSA_URL || TSA_PADRAO;
  // nonce positivo (primeiro byte < 0x80)
  const nonce = randomBytes(8);
  nonce[0] &= 0x7f;
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/timestamp-query" }, body: new Uint8Array(pedido(hashHex, nonce)), signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`autoridade respondeu ${r.status}`);
    const tsr = Buffer.from(await r.arrayBuffer());
    const resp = A.fromDer(forge.util.createBuffer(tsr.toString("binary")));
    const [statusInfo, token] = filhos(resp);
    const status = A.derToInteger(forge.util.createBuffer(filhos(statusInfo)[0].value as string));
    if (status !== 0 && status !== 1) throw new Error(`carimbo recusado (status ${status})`);
    // token = ContentInfo { oid signedData, [0] SignedData { ..., encapContentInfo { oid tstInfo, [0] OCTET STRING TSTInfo } } }
    const signedData = filhos(filhos(token)[1])[0];
    const encap = filhos(signedData).find((n) => n.type === A.Type.SEQUENCE && filhos(n)[0]?.type === A.Type.OID && A.derToOid(filhos(n)[0].value as string) === "1.2.840.113549.1.9.16.1.4");
    if (!encap) throw new Error("resposta sem TSTInfo");
    const octeto = filhos(filhos(encap)[1])[0];
    const bruto = octeto.composed ? filhos(octeto).map((p) => p.value as string).join("") : (octeto.value as string);
    const tst = filhos(A.fromDer(forge.util.createBuffer(bruto)));
    // TSTInfo: version, policy, messageImprint, serialNumber, genTime, ...
    const politica = A.derToOid(tst[1].value as string);
    const imprint = forge.util.bytesToHex(filhos(tst[2])[1].value as string);
    if (imprint.toLowerCase() !== hashHex.toLowerCase()) throw new Error("o carimbo não é deste documento");
    const serie = forge.util.bytesToHex(tst[3].value as string).replace(/^0+(?=.)/, "").toUpperCase();
    const quando = A.generalizedTimeToDate(tst[4].value as string).toISOString();
    return { tsa: new URL(url).host, serie, quando, politica, tsr };
  } catch (e) {
    console.error("carimbo do tempo:", e instanceof Error ? e.message : e);
    return null;
  }
}
