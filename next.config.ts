import type { NextConfig } from "next";

// Build para o Cloudflare Workers (scripts/cf-build.mjs define DEPLOY_TARGET=cloudflare).
const isCloudflare = process.env.DEPLOY_TARGET === "cloudflare";

// Cabeçalhos de segurança em todas as respostas. A CSP aqui só proíbe embutir o app em iframe
// de outro site e limita <form>/<base>; não restringe scripts para não quebrar o widget do Pluggy.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // HSTS só vale sobre HTTPS; em produção força o navegador a nunca usar HTTP.
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
    ];
  },
  // Valor fixado no build: o instrumentation.ts usa para não ligar o agendador interno no Worker.
  env: { DEPLOY_TARGET: isCloudflare ? "cloudflare" : "node" },
  serverExternalPackages: isCloudflare ? [] : ['@electric-sql/pglite'],
  agentRules: false,
  experimental: {
    // A importação manda o arquivo (até 5 MB; PDF em base64 fica ~6,7 MB) por Server Action. O padrão é 1 MB.
    serverActions: { bodySizeLimit: '8mb' },
  },
  /* config options here */
  turbopack: {
    // No Worker não há PGlite nem processo contínuo: troca o driver do banco (ver src/server/db/client.ts).
    resolveAlias: isCloudflare
      ? { "@/server/db/driver": "./src/server/db/driver.cloudflare.ts" }
      : {},
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
