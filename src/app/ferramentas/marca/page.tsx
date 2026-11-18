import type { Metadata, Viewport } from "next";
import { Lato } from "next/font/google";
import { IscaMarca } from "./isca-marca";

// Isca 1 (18/11/2026, pedido do Maurício): ferramenta grátis "Sua marca pode ser
// registrada?". Prévia na hora (base própria do INPI, sem IA); relatório completo
// pelo WhatsApp depois de deixar nome e telefone (vira lead no CRM, form isca-marca).

const lato = Lato({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-lato" });

export const metadata: Metadata = {
  title: "Sua marca pode ser registrada? · MC Advogados",
  description: "Consulta grátis: veja na hora se já existem marcas parecidas com a sua no INPI e o risco de registro.",
  openGraph: { title: "Sua marca pode ser registrada?", description: "Consulta grátis de marcas parecidas no INPI, em segundos." },
};

export const viewport: Viewport = { themeColor: "#061021" };

export default function Page() {
  return (
    <div className={lato.variable}>
      <IscaMarca />
    </div>
  );
}
