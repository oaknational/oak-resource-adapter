import { createResourceAdapterClient } from "./client.js";
import type { ResourceAdapterReportingProps } from "./publicTypes.js";

/**
 * A crash loop must not flood the API: after this many reports the reporter
 * goes quiet for the rest of the page load. Boundary resets do not restart it.
 */
const MAX_REPORTS_PER_PAGE_LOAD = 5;

/*
 * These mirror `clientErrorReportSchema` in the contracts package. Truncating
 * client-side keeps an oversized honest error deliverable; the server limits
 * then only ever reject hostile input.
 */
const MAX_ERROR_NAME_LENGTH = 100;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_COMPONENT_STACK_LENGTH = 4000;

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

  const errorName = String(error.name ?? "")
    .trim()
    .slice(0, MAX_ERROR_NAME_LENGTH);
  const errorMessage = String(error.message ?? "")
    .trim()
    .slice(0, MAX_ERROR_MESSAGE_LENGTH);
  const truncatedStack = componentStack?.slice(0, MAX_COMPONENT_STACK_LENGTH);

  try {
    await createResourceAdapterClient(reporting).clientErrors.report.mutate({
      errorName: errorName || "Error",
      errorMessage,
      ...(truncatedStack ? { componentStack: truncatedStack } : {}),
    });
  } catch {
    // Swallow: a failed report must never surface or be re-reported.
  }
}
