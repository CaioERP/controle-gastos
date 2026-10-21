import type { NextConfig } from "next";

// Cabeçalhos de segurança em todas as respostas. A CSP aqui só proíbe embutir o app em iframe
// de outro site e limita <form>/<base>; não restringe scripts para não quebrar o widget do Pluggy.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // HSTS só vale sobre HTTPS; em produção força o navegador a nunca usar HTTP.
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
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
