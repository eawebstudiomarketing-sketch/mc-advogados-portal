import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listPessoas } from "@/lib/data/escritorio";
import { NovaAta } from "./nova-ata";

export const metadata = { title: "Nova ata" };

// Nova ata: dados da reunião + participantes, e a gravação (microfone, ou
// microfone + som da reunião online) que sobe em pedaços de 30 s. Também
// aceita um arquivo de áudio já gravado. ?cliente=<id> já chega com o cliente.
export default async function NovaAtaPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { profile } = await exigirPermissao("atas");
  const { cliente } = await searchParams;
  const db = await createClient();
  const [{ data: clientes }, pessoas] = await Promise.all([db.from("clients").select("id, name").eq("active", true).order("name"), listPessoas()]);
  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow mb-2">Operacional · Atas</p>
        <h1 className="page-title">Nova ata</h1>
        <p className="mt-1 text-sm text-muted">Preencha a reunião, avise que vai gravar e clique em Começar. Pode trocar de aba ou minimizar: a gravação continua e é salva a cada 30 segundos.</p>
      </div>
      <NovaAta
        clientes={clientes ?? []}
        equipe={pessoas.filter((p) => p.profileId).map((p) => ({ profileId: p.profileId!, nome: p.nome, telefone: p.telefone, email: p.email }))}
        meuProfileId={profile.id}
        clienteInicial={cliente && (clientes ?? []).some((c) => c.id === cliente) ? cliente : null}
      />
    </div>
  );
}
