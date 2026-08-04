import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack to this app so it doesn't watch the parent github/ tree
  // (there's a stray yarn.lock up there that Next otherwise treats as root).
  turbopack: {
    root: process.cwd(),
  },
  // Allows accessing the dev server from other devices on the LAN
  // (e.g. testing login on a phone at 192.168.1.205:3000). Next.js
  // blocks cross-origin requests to dev-only endpoints by default.
  allowedDevOrigins: ["192.168.1.205"],
};

export default nextConfig;
