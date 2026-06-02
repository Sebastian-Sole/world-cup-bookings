import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's client/HMR assets to be requested from other devices
  // on the LAN (e.g. testing on a phone at http://192.168.x.x:3000 or
  // http://sole-kno.local:3000). Next 16 blocks these cross-origin dev requests
  // by default, which makes the page load but never hydrate (dead buttons).
  // Only affects `next dev`; has no effect on production builds.
  allowedDevOrigins: [
    "192.168.1.54",
    "sole-kno",
    "sole-kno.local",
    "*.local",
  ],
};

export default nextConfig;
