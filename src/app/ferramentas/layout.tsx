import type { Viewport } from "next";
import { Lato, Playfair_Display } from "next/font/google";

// Ferramentas grátis (iscas) do site: mesmas fontes e cor de barra em todas.
const lato = Lato({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--font-lato" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600", "800"], style: ["normal", "italic"], variable: "--font-playfair" });

export const viewport: Viewport = { themeColor: "#07111f" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`${lato.variable} ${playfair.variable}`}>{children}</div>;
}
