import type { Metadata, Viewport } from "next";
import { Lato, Playfair_Display } from "next/font/google";
import { IscaMarca } from "./isca-marca";

// Isca 1 (18/11/2026, pedido do Maurício): ferramenta grátis "Sua marca pode ser
// registrada?". Prévia na hora (base própria de marcas, sem IA); relatório completo
// pelo WhatsApp depois de deixar nome e telefone (vira lead no CRM, form isca-marca).
// 18/11 (v2, pedido do João): sem falar de INPI/base na tela, visual com mais impacto.
// 19/11 (v3): ramo digitado, prévia no formato do Relatório de Viabilidade e só o botão do especialista (sem lead).

const lato = Lato({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-lato" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "800"], style: ["normal", "italic"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "Sua marca está livre? · MC Advogados",
  description: "Prévia grátis do relatório de viabilidade: veja em segundos se alguém já tem uma marca parecida com a sua.",
  openGraph: { title: "Sua marca está livre?", description: "Descubra em segundos se alguém já tem uma marca parecida com a sua." },
};

export const viewport: Viewport = { themeColor: "#07111f" };

export default function Page() {
  return (
    <div className={`${lato.variable} ${playfair.variable}`}>
      <IscaMarca />
    </div>
  );
}
