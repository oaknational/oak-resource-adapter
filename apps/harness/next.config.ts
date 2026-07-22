import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    styledComponents: true,
  },
  transpilePackages: ["@oaknational/resource-adapter"],
  // The browser can't read `process.env` at runtime, so mirror the server-side
  // DEBUG value into the client bundle at build time.
  env: {
    NEXT_PUBLIC_DEBUG: process.env.DEBUG,
  },
};

export default nextConfig;
