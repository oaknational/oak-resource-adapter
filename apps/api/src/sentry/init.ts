import { setErrorReporter } from "@oaknational/resource-adapter-logger";
import * as Sentry from "@sentry/nextjs";

import { isDeployment } from "../environment";

// Shared Sentry bootstrap for both server runtimes, invoked from the
// sentry.server.config / sentry.edge.config entry files that instrumentation.ts
// dynamically imports. Server-side only — the DSN is never exposed to the client.
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // Hosted environments require a DSN; local production-mode servers do not.
    if (isDeployment()) {
      throw new Error("SENTRY_DSN is not set; Sentry cannot be initialized");
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT,

    // Prints useful setup information to the console while wiring Sentry up.
    debug: false,
    // Performance tracing is out of scope initially
    tracesSampleRate: 0,
  });

  // Hand the logger a reporter so `log.error(err, { report: true })` reaches Sentry.
  setErrorReporter(Sentry.captureException);
}
