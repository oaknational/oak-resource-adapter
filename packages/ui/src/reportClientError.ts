import { clientErrorReportLimits } from "@oaknational/resource-adapter-contracts";

import { createResourceAdapterClient } from "./client.js";
import type { ResourceAdapterReportingProps } from "./publicTypes.js";

/**
 * A crash loop must not flood the API: after this many reports the reporter
 * goes quiet for the rest of the page load. Boundary resets do not restart it.
 */
const MAX_REPORTS_PER_PAGE_LOAD = 5;

let reportsSent = 0;

export type ReportClientErrorOptions = Readonly<{
  componentStack: string | null;
  error: Error;
  reporting: ResourceAdapterReportingProps;
}>;

/**
 * Fire-and-forget report of a caught render failure to the Resource Adapter
 * API. Resolves void in every failure mode (offline, 401, 500, malformed
 * response): reporting is observability and must never affect the host page
 * or feed an error back into the boundary that called it.
 */
export async function reportClientError({
  componentStack,
  error,
  reporting,
}: ReportClientErrorOptions): Promise<void> {
  if (reportsSent >= MAX_REPORTS_PER_PAGE_LOAD) {
    return;
  }
  reportsSent += 1;

  try {
    // Truncating to the contract's own limits keeps an oversized honest error
    // deliverable, so the server bounds only ever reject hostile input.
    const errorName = String(error.name ?? "")
      .trim()
      .slice(0, clientErrorReportLimits.errorName);
    const errorMessage = String(error.message ?? "")
      .trim()
      .slice(0, clientErrorReportLimits.errorMessage);
    const truncatedStack = componentStack?.slice(
      0,
      clientErrorReportLimits.componentStack,
    );

    await createResourceAdapterClient(reporting).clientErrors.report.mutate({
      errorName: errorName || "Error",
      errorMessage,
      ...(truncatedStack ? { componentStack: truncatedStack } : {}),
    });
  } catch {
    // Swallow: a failed report must never surface or be re-reported. Reading
    // the error's own fields is inside the try so this can never reject.
  }
}
