import { clientErrorReportLimits } from "@oaknational/resource-adapter-contracts";

import { createResourceAdapterClient } from "./client.js";
import type { ResourceAdapterReportingProps } from "./publicTypes.js";

/** Stops a crash loop flooding the API. Boundary resets do not restart the count. */
const MAX_REPORTS_PER_PAGE_LOAD = 5;

let reportsSent = 0;

export type ReportClientErrorOptions = Readonly<{
  componentStack: string | null;
  error: Error;
  reporting: ResourceAdapterReportingProps;
}>;

/**
 * Fire-and-forget report of a caught render failure to the API. Never rejects,
 * whatever goes wrong, so it cannot affect the host page or the boundary.
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
    // Truncate here so the server's limits only ever reject hostile input.
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
    // Swallowed on purpose. Reading the error's fields is inside the try so
    // that this function can never reject.
  }
}
