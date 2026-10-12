import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sparkjsdev/spark"],
  poweredByHeader: false,
};

export default nextConfig;
