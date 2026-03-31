/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep Firecrawl and Anthropic server-side only — they use Node.js built-ins
    // (undici, crypto, etc.) that can't be bundled by webpack.
    serverComponentsExternalPackages: [
      "@mendable/firecrawl-js",
      "@anthropic-ai/sdk",
    ],
  },
};

module.exports = nextConfig;
