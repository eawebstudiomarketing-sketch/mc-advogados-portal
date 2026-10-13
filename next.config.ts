import type { NextConfig } from "next";

// Cabeçalhos de segurança: impedem o portal de ser aberto dentro de outro site
// (clickjacking) e forçam HTTPS. Microfone fica liberado só para o próprio
// portal (áudio do onboarding e do assistente).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
