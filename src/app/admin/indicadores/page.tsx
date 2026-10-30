import { ConteudoIndicadores } from "./conteudo";

export const metadata = { title: "Indicadores" };

// Indicadores: o conteúdo fica em ./conteudo (reaproveitado na página de cada pessoa em Equipe).
export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<{ p?: string; pessoa?: string }> }) {
  return <ConteudoIndicadores sp={await searchParams} />;
}
