import { exigirPermissao } from "@/lib/dal";
import { listColidencias, listMarcas, listRevistas, nomeDaMarca } from "@/lib/marcas/dados";
import { PainelColidencias } from "./painel-colidencias";

// Marcas → Colidências: marcas de terceiros publicadas na revista parecidas
// com as nossas (análise por marca, ações necessárias, monitoramento e
// configuração em lote), como no Marca Acompanhada.

export default async function ColidenciasPage({ searchParams }: { searchParams: Promise<{ rpi?: string }> }) {
  await exigirPermissao("marcas");
  const sp = await searchParams;
  const [revistas, marcas, todas] = await Promise.all([listRevistas(), listMarcas(), listColidencias()]);
  const comColid = [...new Set(todas.map((c) => c.rpi))].sort((a, b) => b - a);
  const rpi = Number(sp.rpi) || comColid[0] || revistas[0]?.numero || 0;
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow mb-2">Marcas · INPI</p>
        <h1 className="page-title">Colidências</h1>
        <p className="text-sm text-muted">Marcas iguais ou parecidas com as suas publicadas na revista do INPI, para avaliar oposição.</p>
      </div>
      <PainelColidencias
        rpi={rpi}
        revistas={[...new Set([...comColid, ...revistas.map((r) => r.numero)])].sort((a, b) => b - a)}
        colidencias={todas.map((c) => ({
          id: c.id,
          rpi: c.rpi,
          marcaProcesso: c.marcas.processo,
          marcaNome: nomeDaMarca(c.marcas),
          marcaClasse: c.marcas.classe,
          processo: c.processo,
          nome: c.nome,
          classe: c.classe,
          titular: c.titular,
          despacho: c.despacho,
          semelhanca: c.semelhanca,
          risco: c.risco,
          status: c.status,
        }))}
        marcas={marcas.map((m) => ({ processo: m.processo, nome: nomeDaMarca(m), classe: m.classe, escopo: m.colid_escopo, sensibilidade: m.colid_sensibilidade, auto: m.colid_auto, ativa: m.colidencia }))}
      />
    </div>
  );
}
