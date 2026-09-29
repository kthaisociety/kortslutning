import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by the Dockerfile, which copies .next/standalone.
  output: "standalone",
};

export default nextConfig;
