import { requireRole } from "@/lib/dal";
import { listarTranscricoesAction } from "./actions";
import { TranscricaoApp } from "./transcricao-app";

export const metadata = { title: "Transcrição" };

// Aba Transcrição: manda ou grava um áudio (ou vídeo) e recebe a transcrição
// fiel e/ou o resumo com IA, editável, para baixar em TXT, PDF, Word ou abrir
// no Google Docs. Histórico de cada pessoa (admin vê o de todos).
export default async function TranscricaoPage() {
  const profile = await requireRole(["admin", "advogado"]);
  const lista = await listarTranscricoesAction();
  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow mb-2">Operacional · Transcrição</p>
        <h1 className="page-title">Transcrição de áudio</h1>
        <p className="mt-1 text-sm text-muted">Mande ou grave um áudio: sai o texto palavra por palavra, o resumo com IA ou os dois. Dá para editar e baixar em TXT, PDF, Word ou abrir no Google Docs.</p>
      </div>
      <TranscricaoApp inicial={lista} meuId={profile.id} souAdmin={profile.role === "admin"} />
    </div>
  );
}
