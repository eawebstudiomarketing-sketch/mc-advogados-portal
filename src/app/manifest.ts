import type { MetadataRoute } from "next";

// "Adicionar à tela inicial": abre direto no assistente, em tela cheia.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Assistente MC Advogados",
    short_name: "Assistente MC",
    description: "Peça ao assistente do portal pelo celular: texto, voz e anexos.",
    start_url: "/assistente",
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
  };
}
