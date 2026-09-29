import { execSync } from "node:child_process";

import type { NextConfig } from "next";

const buildVersion = (): string => {
  try {
    const sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return `${sha} ${new Date().toISOString().slice(0, 16)}`;
  } catch {
    return `ukjent ${new Date().toISOString().slice(0, 16)}`;
  }
};

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: buildVersion(),
  },
  outputFileTracingIncludes: {
    "/api/**/*": ["./assets/fonts/**/*"],
  },
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
