import type { Metadata } from "next";
import { IscaCusto } from "./isca-custo";

// Isca 2 (18/11/2026): "Quanto custa um funcionário?". Conta na hora no navegador;
// o detalhamento item por item libera depois de deixar nome e WhatsApp (lead no CRM, form isca-custo).

export const metadata: Metadata = {
  title: "Quanto custa um funcionário? · MC Advogados",
  description: "Descubra em segundos quanto um funcionário custa de verdade para a sua empresa por mês e por ano.",
  openGraph: { title: "Quanto custa um funcionário de verdade?", description: "A conta que quase ninguém faz antes de contratar." },
};

export default function Page() {
  return <IscaCusto />;
}
