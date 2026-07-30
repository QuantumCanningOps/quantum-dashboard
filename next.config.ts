import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Allows accessing the dev server from other devices on the LAN
  // (e.g. testing login on a phone at 192.168.1.205:3000). Next.js
  // blocks cross-origin requests to dev-only endpoints by default.
  allowedDevOrigins: ["192.168.1.205"],
};

export default nextConfig;
