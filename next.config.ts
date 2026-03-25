import type { NextConfig } from "next";

const packageVersion = process.env.npm_package_version || "0.1.0";
const deploymentId =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
const deploymentSuffix = deploymentId.replace(/^dpl_/i, "").slice(0, 8) || "local";
const buildNumber = `${packageVersion}+${deploymentSuffix}`;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_NUMBER: buildNumber,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
