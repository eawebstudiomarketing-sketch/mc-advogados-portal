import type { MetadataRoute } from "next";

// App instalável do portal (item 32 da auditoria, 30/10/2026): abre na Área de
// trabalho; segurando o ícone aparecem os atalhos (o Assistente continua a um
// toque). Antes abria direto no assistente.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MC Advogados",
    short_name: "MC Advogados",
    description: "Portal do escritório MC Advogados: demandas, agenda, processos, clientes e assistente.",
    id: "/admin",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    background_color: "#0a1b31",
    theme_color: "#0a1b31",
    lang: "pt-BR",
    icons: [
      { src: "/brand/app-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/app-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Assistente", short_name: "Assistente", url: "/assistente", icons: [{ src: "/brand/app-192.png", sizes: "192x192" }] },
      { name: "Demandas", url: "/admin/activities", icons: [{ src: "/brand/app-192.png", sizes: "192x192" }] },
      { name: "Agenda", url: "/admin/agenda", icons: [{ src: "/brand/app-192.png", sizes: "192x192" }] },
      { name: "Caixa de entrada", url: "/admin/alertas", icons: [{ src: "/brand/app-192.png", sizes: "192x192" }] },
    ],
  };
}
