import type { Metadata } from "next";
import { IscaEscala } from "./isca-escala";

// Isca 4 (19/11/2026): "Sua escala fecha na 5x2?". Monta a escala de 4 semanas no navegador
// (src/lib/iscas/escala.ts); o mês inteiro, a conferência e as dicas liberam depois de deixar
// nome e WhatsApp (lead no CRM, form isca-escala).

export const metadata: Metadata = {
  title: "Sua escala fecha na 5x2? · MC Advogados",
  description: "Duas folgas por semana e 42 horas a partir de 16/12. Monte a escala da sua equipe em segundos e veja se precisa contratar.",
  openGraph: { title: "Sua escala fecha na 5x2?", description: "Monte grátis a escala da sua equipe para a nova jornada." },
};

export default function Page() {
  return <IscaEscala />;
}
