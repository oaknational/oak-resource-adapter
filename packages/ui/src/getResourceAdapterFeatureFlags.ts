import { TRPCClientError } from "@trpc/client";
import { resourceAdapterFeatureFlagsResponseSchema } from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterFeatureFlagsResponse } from "@oaknational/resource-adapter-contracts/internal";

import type { ResourceAdapterHostProps } from "./publicTypes.js";
import { createResourceAdapterInternalClient } from "./client.js";
import { ResourceAdapterApiError } from "./getResourceAdapterCapabilities.js";

type ResourceAdapterFeatureFlagsHostProps = Pick<
  ResourceAdapterHostProps,
  "apiBaseUrl" | "getToken"
>;

/**
 * Retrieves feature flags enabled for the authenticated teacher.
 */
export async function getResourceAdapterFeatureFlags({
  apiBaseUrl,
  getToken,
}: ResourceAdapterFeatureFlagsHostProps): Promise<ResourceAdapterFeatureFlagsResponse> {
  try {
    const response = await createResourceAdapterInternalClient({
      apiBaseUrl,
      getToken,
    }).featureFlags.get.query();
    const parsedResponse =
      resourceAdapterFeatureFlagsResponseSchema.safeParse(response);

    if (!parsedResponse.success) {
      throw new ResourceAdapterApiError(
        "Resource Adapter returned an invalid feature flags response.",
      );
    }

    return parsedResponse.data;
  } catch (error) {
    if (error instanceof ResourceAdapterApiError) {
      throw error;
    }

    if (error instanceof TRPCClientError) {
      throw new ResourceAdapterApiError(
        "Resource Adapter could not load feature flags.",
        error.data?.httpStatus,
      );
    }

    throw new ResourceAdapterApiError("Resource Adapter could not load feature flags.");
  }
}
