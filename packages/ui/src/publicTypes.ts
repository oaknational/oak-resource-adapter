import type {
  LessonContext,
  LessonResourceType,
} from "@oaknational/resource-adapter-contracts";
import type {
  ResourceAdapterCapabilitiesResponse,
  ResourceAdapterCapability,
  ResourceAdapterCapabilityId,
} from "./capabilities.js";

/** Public host and capability types shipped with the UI package. */
export type {
  LessonContext,
  LessonResourceType,
  ResourceAdapterCapabilitiesResponse,
  ResourceAdapterCapability,
  ResourceAdapterCapabilityId,
};

export type GetToken = () => Promise<string | null>;

export type ResourceAdapterHostProps = Readonly<{
  getToken: GetToken;
  lesson: LessonContext;
  trpcEndpoint: string;
}>;

/**
 * Deliberately a plain serialisable object rather than React's `ErrorInfo`:
 * the host may resolve a different React copy than this package was built
 * against, so no React types cross the boundary. React 19 types
 * `componentStack` as possibly undefined; it is normalised to null here.
 */
export type ResourceAdapterErrorInfo = Readonly<{
  componentStack: string | null;
}>;

/**
 * Host callback invoked when the error boundary catches a render failure,
 * e.g. wiring OWA's `errorReporter` in. It may silently no-op (consent-gated
 * reporters do); the package's own API reporting never depends on it.
 */
export type ResourceAdapterErrorHandler = (
  error: Error,
  info: ResourceAdapterErrorInfo,
) => void;

/** Credentials the boundary needs to report caught errors to the API. */
export type ResourceAdapterReportingProps = Readonly<{
  getToken: GetToken;
  trpcEndpoint: string;
}>;
