import { exigirPermissao } from "@/lib/dal";
import { PainelBuscaIntegrada } from "./painel-busca";

// Viabilidade → Busca Integrada de Marcas INPI (como no Marca Acompanhada).
export const maxDuration = 120;

export default async function BuscaIntegradaPage() {
  await exigirPermissao("marcas");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">Busca Integrada de Marcas INPI</h1>
        <p className="mt-1 text-sm text-muted">Pesquise processos do INPI usando os critérios abaixo.</p>
      </div>
      <PainelBuscaIntegrada />
    </div>
  );
}
