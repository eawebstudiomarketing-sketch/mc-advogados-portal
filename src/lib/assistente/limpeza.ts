import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PREFIXO_ANEXOS } from "@/lib/assistente/tools";

const DIAS = 7;

// Apaga anexos do chat que não foram guardados num cliente há mais de 7 dias
// (decisão do usuário, 08/10/2026). Anexo guardado já saiu desta pasta.
export async function limparAnexosAntigos(): Promise<number> {
  const storage = createAdminClient().storage.from("documents");
  const corte = Date.now() - DIAS * 86_400_000;
  const { data: pastas } = await storage.list(PREFIXO_ANEXOS, { limit: 1000 });
  let apagados = 0;
  for (const pasta of pastas ?? []) {
    if (pasta.id) continue; // só subpastas (uma por pessoa); arquivo solto não deveria existir aqui
    const base = `${PREFIXO_ANEXOS}/${pasta.name}`;
    const { data: arquivos } = await storage.list(base, { limit: 1000 });
    const velhos = (arquivos ?? []).filter((f) => f.id && f.created_at && Date.parse(f.created_at) < corte).map((f) => `${base}/${f.name}`);
    if (velhos.length) {
      const { error } = await storage.remove(velhos);
      if (!error) apagados += velhos.length;
    }
  }
  return apagados;
}
