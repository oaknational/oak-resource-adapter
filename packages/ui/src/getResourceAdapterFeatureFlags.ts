import { resourceAdapterFeatureFlagsResponseSchema } from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterFeatureFlagsResponse } from "@oaknational/resource-adapter-contracts/internal";

import type { ResourceAdapterHostProps } from "./publicTypes.js";
import { callApi, createResourceAdapterInternalClient } from "./client.js";
import { ResourceAdapterApiError } from "./errors.js";

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
  return callApi("Resource Adapter could not load feature flags.", async () => {
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
  });
}
