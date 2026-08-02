import * as Sentry from "@sentry/nextjs";

import type { ClientErrorReport } from "@oaknational/resource-adapter-contracts";
import { raLogger } from "@oaknational/resource-adapter-logger";

const log = raLogger("client-errors");

/**
 * Forwards a UI-package error boundary report to Sentry.
 *
 * Kept outside the router so tests can exercise it directly, mirroring
 * `capabilities.ts`.
 *
 * Sentry is called directly rather than through the logger's error reporter
 * because that seam is `(error: unknown) => void` and cannot carry tags. The
 * `source: client-ui` tag marks events reported on behalf of the UI package.
 *
 * The synthetic error is built from the already size-limited report fields
 * only; the raw client value is never attached as `cause`, so nothing beyond
 * the vetted schema can reach Sentry.
 *
 * The explicit fingerprint matters: every synthetic error shares this stack
 * frame, so Sentry's default stack-based grouping would fold every distinct
 * client failure into a single issue.
 */
export function reportClientError(report: ClientErrorReport): void {
  try {
    const error = new Error(report.errorMessage || report.errorName);
    error.name = report.errorName;

    Sentry.captureException(error, {
      fingerprint: [
        "resource-adapter-client-error",
        report.errorName,
        report.errorMessage,
      ],
      level: "error",
      tags: { source: "client-ui" },
      extra: { componentStack: report.componentStack ?? null },
    });
  } catch (sentryError) {
    // Reporting is observability only: a Sentry failure must never surface to
    // the client, and `report: false` keeps it from re-entering Sentry.
    log.error(sentryError, { report: false });
  }
}
