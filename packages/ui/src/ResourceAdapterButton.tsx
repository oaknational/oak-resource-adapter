"use client";

import { OakPrimaryButton } from "@oaknational/oak-components";

import { ResourceAdapterErrorBoundary } from "./ResourceAdapterErrorBoundary.js";
import type {
  GetToken,
  ResourceAdapterErrorHandler,
  ResourceAdapterReportingProps,
} from "./publicTypes.js";

export type ResourceAdapterButtonProps = Readonly<{
  /** Enables reporting caught render failures to the API when set with `trpcEndpoint`. */
  getToken?: GetToken;
  onClick: () => void;
  /** Invoked with any caught render failure, for the host's own observability. */
  onError?: ResourceAdapterErrorHandler;
  trpcEndpoint?: string;
}>;

function toReporting(
  getToken: GetToken | undefined,
  trpcEndpoint: string | undefined,
): ResourceAdapterReportingProps | undefined {
  return getToken && trpcEndpoint ? { getToken, trpcEndpoint } : undefined;
}

/**
 * The lesson-page trigger. OWA decides where to place it after it has resolved
 * the available capabilities for the current lesson and teacher.
 *
 * A render crash hides the trigger rather than reaching the host page. It is
 * still reported when the props allow it: the boundary catches before any host
 * boundary can, so without this the failure would be invisible everywhere.
 */
export function ResourceAdapterButton({
  getToken,
  onClick,
  onError,
  trpcEndpoint,
}: ResourceAdapterButtonProps) {
  const reporting = toReporting(getToken, trpcEndpoint);

  return (
    <ResourceAdapterErrorBoundary
      fallback={() => null}
      {...(onError ? { onError } : {})}
      {...(reporting ? { reporting } : {})}
    >
      <OakPrimaryButton onClick={onClick}>Create more with AI</OakPrimaryButton>
    </ResourceAdapterErrorBoundary>
  );
}
