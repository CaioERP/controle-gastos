import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite'],
  agentRules: false,
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
