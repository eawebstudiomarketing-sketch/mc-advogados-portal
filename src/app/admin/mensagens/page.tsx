import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { GERAL, lerMensagens, listarAvisos, listarEquipe, resumoDasConversas } from "@/lib/data/mensagens";
import { MensagensApp } from "./mensagens-app";

export const metadata = { title: "Mensagens" };

export default async function MensagensPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const profile = await requireRole(["admin", "advogado"]);
  const { c } = await searchParams;
  const equipe = await listarEquipe(profile.id);
  // conversa pedida no link (vinda de um aviso no celular): já abre lida
  const conversa = c && (c === GERAL || c.startsWith("dm:")) ? c : null;
  if (conversa) {
    const db = await createClient();
    await db.from("chat_leituras").upsert({ profile_id: profile.id, conversa, lido_em: new Date().toISOString() });
  }
  const [resumo, avisos, mensagens] = await Promise.all([
    resumoDasConversas(profile.id, equipe),
    listarAvisos(profile.id),
    conversa ? lerMensagens(conversa) : Promise.resolve([]),
  ]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="page-title">Mensagens</h1>
        <p className="text-sm text-muted">Conversas da equipe, o canal Escritório e os seus avisos (marcações, comentários e atividades que caíram com você).</p>
      </div>
      <MensagensApp
        eu={{ id: profile.id, nome: profile.full_name }}
        equipe={equipe}
        resumoInicial={resumo}
        avisosIniciais={avisos}
        abrirInicial={c ?? null}
        mensagensIniciais={mensagens}
      />
    </div>
  );
}
