import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // The fixture corpus is read at runtime by a path the bundler cannot see, so
  // file tracing leaves it out of the deployed function unless it is named here,
  // and bundling the reader would move `import.meta.url` away from it.
  outputFileTracingIncludes: {
    "/**": ["../../packages/original-resource-documents/fixtures/**"],
  },
  serverExternalPackages: [
    "@oaknational/resource-adapter-original-resource-documents",
    "@oaknational/resource-document",
  ],
};

export default withSentryConfig(withWorkflow(nextConfig), {
  // Only print source-map upload logs in CI; keep local builds quiet.
  silent: !process.env.CI,
});
