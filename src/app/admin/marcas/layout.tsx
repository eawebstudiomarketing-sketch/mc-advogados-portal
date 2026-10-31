import { Inter } from "next/font/google";

// Seção Marcas (INPI): mesmo visual do Marca Acompanhada (ver .tema-marcas no globals.css).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", weight: ["400", "500", "600", "700"] });

export default function MarcasLayout({ children }: { children: React.ReactNode }) {
  return <div className={`tema-marcas ${inter.variable}`}>{children}</div>;
}
