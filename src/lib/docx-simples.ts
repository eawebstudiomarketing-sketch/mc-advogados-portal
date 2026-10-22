import { strToU8, zipSync } from "fflate";
import type { Bloco } from "./transcricao-formato";

// Word (.docx) mínimo, sem biblioteca: só os 3 arquivos que o Word e o Google
// Docs exigem. Estilos direto em cada parágrafo (título, seção, texto).

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const ESTILO: Record<Bloco["tipo"], { tam: number; negrito?: boolean; cor: string; depois: number; antes?: number }> = {
  titulo: { tam: 36, negrito: true, cor: "091827", depois: 60 },
  meta: { tam: 18, cor: "66727D", depois: 240 },
  secao: { tam: 28, negrito: true, cor: "091827", depois: 120, antes: 280 },
  subsecao: { tam: 21, negrito: true, cor: "8A6C2C", depois: 80, antes: 200 },
  paragrafo: { tam: 22, cor: "1B2732", depois: 140 },
};

function paragrafo(b: Bloco): string {
  const e = ESTILO[b.tipo];
  const borda = b.tipo === "secao" ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="C6A24F"/></w:pBdr>` : "";
  return `<w:p><w:pPr>${borda}<w:spacing w:before="${e.antes ?? 0}" w:after="${e.depois}" w:line="300" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${e.negrito ? "<w:b/>" : ""}<w:color w:val="${e.cor}"/><w:sz w:val="${e.tam}"/></w:rPr><w:t xml:space="preserve">${esc(b.texto)}</w:t></w:r></w:p>`;
}

export function docxDeBlocos(blocos: Bloco[]): Uint8Array {
  const corpo = blocos.map(paragrafo).join("");
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    ),
    "word/document.xml": strToU8(documento),
  });
}

export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
