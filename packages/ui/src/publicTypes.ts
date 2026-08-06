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
 * A plain object rather than React's `ErrorInfo`, because the host may resolve a
 * different copy of React. `componentStack` is normalised to null when absent.
 */
export type ResourceAdapterErrorInfo = Readonly<{
  componentStack: string | null;
}>;

/** Called when the boundary catches a render failure, for the host to report. */
export type ResourceAdapterErrorHandler = (
  error: Error,
  info: ResourceAdapterErrorInfo,
) => void;
