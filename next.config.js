/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      "@mendable/firecrawl-js",
      "@anthropic-ai/sdk",
      "@libsql/client",
      "@prisma/adapter-libsql",
    ],
  },
};

module.exports = nextConfig;
