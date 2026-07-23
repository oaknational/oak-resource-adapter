import { TRPCClientError } from "@trpc/client";
import { resourceAdapterCapabilitiesResponseSchema } from "@oaknational/resource-adapter-contracts";

import type {
  ResourceAdapterCapabilitiesResponse,
  ResourceAdapterHostProps,
} from "./publicTypes.js";
import { getSupportedCapabilities } from "./capabilities.js";
import { createResourceAdapterClient } from "./client.js";

export class ResourceAdapterApiError extends Error {
  public readonly status: number | undefined;

  public constructor(message: string, status?: number) {
    super(message);
    this.name = "ResourceAdapterApiError";
    this.status = status;
  }
}

/**
 * Retrieves the service-owned capabilities for a lesson. OWA uses this client
 * rather than duplicating request shape, bearer-token handling, or runtime
 * response validation.
 */
export async function getResourceAdapterCapabilities({
  getToken,
  lesson,
  trpcEndpoint,
}: ResourceAdapterHostProps): Promise<ResourceAdapterCapabilitiesResponse> {
  try {
    const response = await createResourceAdapterClient({
      getToken,
      trpcEndpoint,
    }).capabilities.get.query(lesson);
    const parsedResponse =
      resourceAdapterCapabilitiesResponseSchema.safeParse(response);

    if (!parsedResponse.success) {
      throw new ResourceAdapterApiError(
        "Resource Adapter returned an invalid capabilities response.",
      );
    }

    return getSupportedCapabilities(parsedResponse.data);
  } catch (error) {
    if (error instanceof ResourceAdapterApiError) {
      throw error;
    }

    if (error instanceof TRPCClientError) {
      throw new ResourceAdapterApiError(
        "Resource Adapter could not load capabilities.",
        error.data?.httpStatus,
      );
    }

    throw new ResourceAdapterApiError("Resource Adapter could not load capabilities.");
  }
}
