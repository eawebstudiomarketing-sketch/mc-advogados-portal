import { exigirPermissao } from "@/lib/dal";
import { listClients } from "@/lib/data/clients";
import { BackButton } from "@/components/nav/back-button";
import { FormNovoRegimento } from "./form-novo";

// Regimento Interno → Novo regimento (gerado com IA).
export const maxDuration = 120;

export default async function NovoRegimentoPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  await exigirPermissao("onboarding", "gerar_ia");
  const [clientes, { clientId }] = await Promise.all([listClients(), searchParams]);
  return (
    <div className="space-y-5">
      <BackButton fallback={clientId ? `/admin/clients/${clientId}?aba=regimento` : "/admin/regimentos"} />
      <div>
        <p className="eyebrow mb-2">Regimento Interno</p>
        <h1 className="page-title">Novo regimento</h1>
        <p className="text-sm text-muted">Informe o segmento e alguns dados da empresa. A IA monta o questionário com as seções e perguntas daquele ramo; depois é só revisar e copiar o link.</p>
      </div>
      <FormNovoRegimento clientes={clientes.map((c) => ({ id: c.id, name: c.name }))} clienteInicial={clientId} />
    </div>
  );
}
