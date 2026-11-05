import { exigirPermissao } from "@/lib/dal";
import { Assistente } from "@/components/assistente/assistente";

export const metadata = { title: "IA" };

// Ferramentas › IA (23/10/2026): o mesmo assistente do Ctrl+J, em tela grande
// dentro do portal (mesma conversa). Os "poderes jurídicos" (pesquisa de
// jurisprudência, peças etc.) entram aqui quando forem definidos.
export default async function IaPage() {
  const { profile } = await exigirPermissao("assistente");
  return (
    <div className="-mt-2">
      <h1 className="sr-only">IA do escritório</h1>
      <Assistente nome={profile.full_name.split(" ")[0] ?? ""} usuarioId={profile.id} modo="tela" />
    </div>
  );
}
