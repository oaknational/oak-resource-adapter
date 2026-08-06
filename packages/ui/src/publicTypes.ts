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
  apiBaseUrl: string;
  getToken: GetToken;
  lesson: LessonContext;
}>;

/**
 * A plain object rather than React's `ErrorInfo`, because the host may resolve a
 * different copy of React. `componentStack` is normalised to null when absent.
 */
export type ResourceAdapterErrorInfo = Readonly<{
  componentStack: string | null;
}>;

/**
 * Called when the adapter catches an error, for the host to report. Render
 * failures carry a `componentStack`; errors from our own requests do not.
 */
export type ResourceAdapterErrorHandler = (
  error: Error,
  info: ResourceAdapterErrorInfo,
) => void;
