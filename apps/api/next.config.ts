import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

// Off Vercel, withWorkflow puts the local run store in `.next/workflow-data`,
// which Turborepo caches as build output: job state would travel with the cache.
// Both variables have to be set together — given only the directory, the plugin
// overwrites it.
if (!process.env.VERCEL_DEPLOYMENT_ID && !process.env.WORKFLOW_TARGET_WORLD) {
  process.env.WORKFLOW_TARGET_WORLD = "local";
  process.env.WORKFLOW_LOCAL_DATA_DIR ??= ".workflow-data";
}

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
