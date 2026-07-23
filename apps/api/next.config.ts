import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  transpilePackages: ["@oaknational/resource-adapter-db"],
};

export default withWorkflow(nextConfig);
