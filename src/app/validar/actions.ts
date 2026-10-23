"use server";

import { validarDocumento, type Validacao } from "@/lib/atas/assinatura";

// Validação pública de documentos assinados pelo portal: pelo código impresso
// no rodapé do PDF ou pela impressão digital (SHA-256) calculada no navegador
// (o arquivo não é enviado).
export async function validarAction(entrada: { codigo?: string; hash?: string }): Promise<Validacao | null> {
  return validarDocumento({ codigo: String(entrada.codigo ?? "").slice(0, 20), hash: String(entrada.hash ?? "").slice(0, 64) });
}
