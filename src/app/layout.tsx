import type { Metadata, Viewport } from "next";
import { Geist_Mono, Nunito_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Visual do Astrea (pedido do Maurício, 30/10): a fonte deles é a Museo Sans (paga); a Nunito Sans é a mais próxima
const nunito = Nunito_Sans({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MC Advogados Portal",
  description: "Portal de clientes MC Advogados",
  // iPhone: "Adicionar à Tela de Início" abre como app (a página do assistente tem o dela)
  appleWebApp: { capable: true, title: "MC Advogados", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0a1b31" };

// Tema antes de pintar a tela (sem piscar branco): escolha salva ou o do sistema.
const SCRIPT_TEMA = `try{var t=localStorage.getItem("tema");if(t==="escuro"||(t!=="claro"&&window.matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.dataset.theme="dark"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${nunito.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!rounded-xl !border !border-border !bg-surface !text-foreground !shadow-lg !font-sans",
              description: "!text-muted",
            },
          }}
        />
      </body>
    </html>
  );
}
