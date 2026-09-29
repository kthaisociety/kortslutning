import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by the Dockerfile, which copies .next/standalone.
  output: "standalone",
  // Migrations are read from disk at server start (src/instrumentation.ts).
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
