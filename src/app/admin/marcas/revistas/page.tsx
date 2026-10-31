import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listRevistas } from "@/lib/marcas/dados";
import { ListaRevistas, type LinhaRevista } from "./lista-revistas";

// Marcas → Revistas INPI: as Revistas da Propriedade Industrial de marcas por
// ano, com o PDF oficial e quantos despachos saíram para a carteira.

export default async function RevistasPage() {
  await exigirPermissao("marcas");
  const [lidas, { data: pubs }] = await Promise.all([
    listRevistas(),
    ((await createClient()) as unknown as SupabaseClient).from("marca_publicacoes").select("rpi, data").order("rpi", { ascending: false }).limit(5000),
  ]);
  // revistas conhecidas: as que o portal leu + as do histórico da carteira
  const mapa = new Map<number, LinhaRevista>();
  for (const r of lidas) mapa.set(r.numero, { numero: r.numero, data: r.data, pdfs: (r.pdf_url ?? "").split("|").filter(Boolean), nossos: r.despachos_nossos ?? 0, colidencias: r.colidencias ?? 0, lida: !!r.processada_em });
  const contagem = new Map<number, number>();
  for (const p of pubs ?? []) {
    contagem.set(p.rpi, (contagem.get(p.rpi) ?? 0) + 1);
    if (!mapa.has(p.rpi)) mapa.set(p.rpi, { numero: p.rpi, data: p.data, pdfs: [`https://revistas.inpi.gov.br/pdf/Marcas${p.rpi}.pdf`], nossos: 0, colidencias: 0, lida: false });
  }
  for (const [n, c] of contagem) {
    const r = mapa.get(n)!;
    r.nossos = Math.max(r.nossos, c);
  }
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow mb-2">Marcas · INPI</p>
        <h1 className="page-title">Revistas do INPI</h1>
        <p className="text-sm text-muted">Consulte e baixe as Revistas da Propriedade Industrial de marcas.</p>
      </div>
      <ListaRevistas revistas={[...mapa.values()].sort((a, b) => b.numero - a.numero)} />
    </div>
  );
}
