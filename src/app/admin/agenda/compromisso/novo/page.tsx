import { exigirPermissao } from "@/lib/dal";
import { listClients } from "@/lib/data/clients";
import { getEscritorioConfig, listPessoas } from "@/lib/data/escritorio";
import { destinosDosClientes } from "@/lib/zap/fila";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { CompromissoForm } from "../../compromisso-form";

export default async function NovoCompromissoPage({ searchParams }: { searchParams: Promise<{ dia?: string; clientId?: string; titulo?: string; descricao?: string; andamento?: string; publicacao?: string; voltar?: string }> }) {
  const { profile } = await exigirPermissao("agenda");
  const { dia, clientId, titulo, descricao, andamento, publicacao, voltar } = await searchParams;
  const [clientes, pessoas, config, eu] = await Promise.all([listClients(), listPessoas(), getEscritorioConfig(), responsavelDoPerfil(profile.id)]);
  const destinos = await destinosDosClientes(clientes.map((c) => c.id));
  return (
    <div>
      <h1 className="page-title mb-1">Novo compromisso</h1>
      <p className="mb-6 text-sm text-muted">Reunião, ligação ou evento na agenda. Com cliente, ele pode ser lembrado pelo WhatsApp.</p>
      <CompromissoForm
        inicial={{ dia: /^\d{4}-\d{2}-\d{2}$/.test(dia ?? "") ? dia : undefined, clientId: clientId ?? null, participantes: eu ? [eu] : [], titulo, descricao, andamento, publicacao, voltar, ...(andamento || publicacao ? { tipo: "evento" } : {}) }}
        clientes={clientes.map((c) => ({ id: c.id, name: c.name }))}
        pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome }))}
        destinos={destinos}
        lembretesAtivos={config.lembretes_ativos}
      />
    </div>
  );
}
