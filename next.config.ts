import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-e929d922ccb844f08a8b0edd6450d637.r2.dev",
      },
    ],
  },
};

export default nextConfig;
