import { TRPCClientError } from "@trpc/client";
import type { FeatureFlagKey } from "@oaknational/resource-adapter-contracts/server";

import type { ResourceAdapterHostProps } from "./publicTypes.js";
import { createResourceAdapterClient } from "./client.js";
import { ResourceAdapterApiError } from "./getResourceAdapterCapabilities.js";

type ResourceAdapterFeatureFlagsHostProps = Pick<
  ResourceAdapterHostProps,
  "getToken" | "trpcEndpoint"
>;

/**
 * Retrieves feature flags enabled for the authenticated teacher.
 */
export async function getResourceAdapterFeatureFlags({
  getToken,
  trpcEndpoint,
}: ResourceAdapterFeatureFlagsHostProps): Promise<readonly FeatureFlagKey[]> {
  try {
    return await createResourceAdapterClient({
      getToken,
      trpcEndpoint,
    }).featureFlags.get.query();
  } catch (error) {
    if (error instanceof TRPCClientError) {
      throw new ResourceAdapterApiError(
        "Resource Adapter could not load feature flags.",
        error.data?.httpStatus,
      );
    }

    throw new ResourceAdapterApiError("Resource Adapter could not load feature flags.");
  }
}
