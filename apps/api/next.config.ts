import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {};

export default withSentryConfig(withWorkflow(nextConfig), {
  // Only print source-map upload logs in CI; keep local builds quiet.
  silent: !process.env.CI,
});
