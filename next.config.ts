import type { NextConfig } from "next";

// Cabeçalhos de segurança: impedem o portal de ser aberto dentro de outro site
// (clickjacking) e forçam HTTPS. Microfone fica liberado só para o próprio
// portal (áudio do onboarding e do assistente). Câmera e localização só no
// próprio portal: selfie, foto do documento e local na assinatura das atas.
// Content-Security-Policy (28/10/2026): só fala com o próprio portal, o Supabase e o
// servidor de mídia do escritório. 'unsafe-inline' em script/estilo é exigência do
// Next (scripts de inicialização); mesmo assim a política barra script de fora,
// envio de dados para outros domínios, <object>, <base> e uso em iframe de terceiros.
// (Sem form-action: o consentimento do MCP redireciona para o Claude depois do POST.)
const hostMidia = (() => {
  try {
    return process.env.WA_MIDIA_URL ? new URL(process.env.WA_MIDIA_URL).origin : "";
  } catch {
    return "";
  }
})();
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.supabase.co ${hostMidia}`.trim(),
  `media-src 'self' blob: https://*.supabase.co ${hostMidia}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://viacep.com.br ${hostMidia}`.trim(),
  `frame-src 'self' blob: https://*.supabase.co ${hostMidia}`.trim(),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Formulário público do CRM (/f/..., 06/11/2026): libera só o que o pixel da
// Meta e as tags do Google (GA4 e Ads) precisam para carregar e enviar eventos.
const PIXEL_SCRIPT = "https://connect.facebook.net https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net";
const PIXEL_ENVIO =
  "https://www.facebook.com https://connect.facebook.net https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://googleads.g.doubleclick.net https://www.google.com https://www.google.com.br https://*.g.doubleclick.net";
const cspFormulario = csp
  .replace("script-src 'self' 'unsafe-inline'", `script-src 'self' 'unsafe-inline' ${PIXEL_SCRIPT}`)
  .replace(/img-src ([^;]+)/, `img-src $1 ${PIXEL_ENVIO}`)
  .replace(/connect-src ([^;]+)/, `connect-src $1 ${PIXEL_ENVIO}`)
  .replace(/frame-src ([^;]+)/, "frame-src $1 https://www.facebook.com https://td.doubleclick.net https://www.googletagmanager.com");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
];

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  // formulários do CRM: imagens do Storage passam pelo otimizador (AVIF/WebP no tamanho da tela)
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: supabaseHost ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }] : [],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // o último que bate vale: o formulário público troca só a política de conteúdo
      { source: "/f/:path*", headers: [{ key: "Content-Security-Policy", value: cspFormulario }] },
    ];
  },
  experimental: {
    serverActions: {
      // Padrão do Next é 1MB — documentos/contratos reais (PDF escaneado etc)
      // quase sempre passam disso, causando falha silenciosa no upload.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
