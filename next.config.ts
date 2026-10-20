import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite'],
  agentRules: false,
  experimental: {
    // A importação manda o arquivo (até 5 MB; PDF em base64 fica ~6,7 MB) por Server Action. O padrão é 1 MB.
    serverActions: { bodySizeLimit: '8mb' },
  },
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
