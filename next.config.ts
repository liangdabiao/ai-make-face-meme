import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow canvas to fetch image responses from these hosts (GIF export needs CORS).
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn-hk.51sux.com' },
      { protocol: 'https', hostname: 'd.uguu.se' },
      { protocol: 'https', hostname: '**.uguu.se' },
    ],
  },
  reactStrictMode: true,
  // Accept up to 20MB reference images for stop-motion generation.
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
