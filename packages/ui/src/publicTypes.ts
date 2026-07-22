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
