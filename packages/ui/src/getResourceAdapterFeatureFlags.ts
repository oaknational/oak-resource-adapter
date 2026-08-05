import { TRPCClientError } from "@trpc/client";
import { resourceAdapterFeatureFlagsResponseSchema } from "@oaknational/resource-adapter-contracts/internal";
import type { ResourceAdapterFeatureFlagsResponse } from "@oaknational/resource-adapter-contracts/internal";

import type { ResourceAdapterHostProps } from "./publicTypes.js";
import { createResourceAdapterInternalClient } from "./client.js";
import { ResourceAdapterApiError } from "./getResourceAdapterCapabilities.js";

type ResourceAdapterFeatureFlagsHostProps = Pick<
  ResourceAdapterHostProps,
  "getToken" | "trpcEndpoint"
>;

function deriveInternalEndpoint(publicEndpoint: string): string {
  return publicEndpoint.replace(/\/trpc\/v\d+$/, "/trpc/internal");
}

/**
 * Retrieves feature flags enabled for the authenticated teacher.
 *
 * Automatically derives the internal endpoint from the public endpoint.
 */
export async function getResourceAdapterFeatureFlags({
  getToken,
  trpcEndpoint,
}: ResourceAdapterFeatureFlagsHostProps): Promise<ResourceAdapterFeatureFlagsResponse> {
  const internalEndpoint = deriveInternalEndpoint(trpcEndpoint);

  try {
    const response = await createResourceAdapterInternalClient({
      getToken,
      trpcEndpoint: internalEndpoint,
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
