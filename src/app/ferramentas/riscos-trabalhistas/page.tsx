import type { Metadata } from "next";
import { IscaRiscos } from "./isca-riscos";

// Isca 3 (18/11/2026): diagnóstico de riscos trabalhistas. 12 perguntas de sim/não,
// nota na hora; o plano completo (o que fazer em cada ponto) libera depois de deixar
// nome e WhatsApp (lead no CRM, form isca-riscos).

export const metadata: Metadata = {
  title: "Sua empresa está protegida? · MC Advogados",
  description: "Diagnóstico grátis em 2 minutos: descubra onde sua empresa corre risco de processo trabalhista.",
  openGraph: { title: "Sua empresa está protegida de processos trabalhistas?", description: "12 perguntas rápidas e o diagnóstico na hora." },
};

export default function Page() {
  return <IscaRiscos />;
}
