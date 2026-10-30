import { requireRole, temPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { audioDoWhatsapp } from "@/lib/transcricao-whatsapp";
import { abrirTranscricaoAction, listarTranscricoesAction } from "./actions";
import { TranscricaoApp } from "./transcricao-app";

export const metadata = { title: "Transcrição" };

// Aba Transcrição: manda, grava ou puxa do WhatsApp um áudio (ou vídeo) e
// recebe a transcrição fiel e/ou o resumo com IA, editável, para baixar em
// TXT, PDF, Word ou abrir no Google Docs. Histórico de cada pessoa (admin vê o
// de todos). ?wa=<mensagem> já chega com o áudio do zap escolhido; ?t=<id>
// abre uma transcrição (link do Assistente).
export default async function TranscricaoPage({ searchParams }: { searchParams: Promise<{ wa?: string; t?: string }> }) {
  const profile = await requireRole(["admin", "advogado"]);
  const { wa, t } = await searchParams;
  const podeWhatsapp = await temPermissao("whatsapp");
  const [lista, doZap, aberta] = await Promise.all([
    listarTranscricoesAction(),
    podeWhatsapp && wa ? audioDoWhatsapp(await createClient(), wa) : null,
    t ? abrirTranscricaoAction(t) : null,
  ]);
  const zap = doZap?.audio ?? null;
  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow mb-2">Ferramentas · Transcrição</p>
        <h1 className="page-title">Transcrição de áudio</h1>
        <p className="mt-1 text-sm text-muted">Mande, grave ou puxe do WhatsApp um áudio: sai o texto palavra por palavra, o resumo com IA ou os dois. Dá para editar e baixar em TXT, PDF, Word ou abrir no Google Docs.</p>
      </div>
      <TranscricaoApp
        key={`${wa ?? ""}${t ?? ""}`}
        inicial={lista}
        meuId={profile.id}
        souAdmin={profile.role === "admin"}
        podeWhatsapp={podeWhatsapp}
        zapInicial={zap}
        abertaInicial={zap ? null : aberta}
      />
    </div>
  );
}
