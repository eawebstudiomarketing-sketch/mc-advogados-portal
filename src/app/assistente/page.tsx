import type { Metadata, Viewport } from "next";
import { exigirPermissao } from "@/lib/dal";
import { Assistente } from "@/components/assistente/assistente";

export const metadata: Metadata = {
  title: "Assistente MC",
  description: "Assistente do portal MC Advogados",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Assistente MC", statusBarStyle: "black-translucent" },
  icons: { apple: "/brand/apple-touch-icon.png", icon: "/brand/app-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a1b31",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

// Link próprio do assistente (para usar pelo celular, como app): só o chat,
// em tela cheia. Admin e advogado (cada um com as ações do seu papel).
export default async function AssistentePage() {
  const { profile: profile } = await exigirPermissao("assistente");
  return (
    <main className="min-h-dvh w-full bg-background">
      <Assistente nome={profile.full_name.split(" ")[0] ?? ""} modo="pagina" />
    </main>
  );
}
