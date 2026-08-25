import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Padrão do Next é 1MB — documentos/contratos reais (PDF escaneado etc)
      // quase sempre passam disso, causando falha silenciosa no upload.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
