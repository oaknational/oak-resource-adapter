import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    styledComponents: true,
  },
  transpilePackages: ["@oaknational/resource-adapter"],
};

export default nextConfig;
