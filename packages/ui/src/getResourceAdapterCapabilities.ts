import { resourceAdapterCapabilitiesResponseSchema } from "@oaknational/resource-adapter-contracts";

import type {
  ResourceAdapterCapabilitiesResponse,
  ResourceAdapterHostProps,
} from "./publicTypes.js";
import { getSupportedCapabilities } from "./capabilities.js";
import { callApi, createResourceAdapterClient } from "./client.js";
import { ResourceAdapterApiError } from "./errors.js";

/**
 * Retrieves the service-owned capabilities for a lesson. OWA uses this client
 * rather than duplicating request shape, bearer-token handling, or runtime
 * response validation.
 */
export async function getResourceAdapterCapabilities({
  apiBaseUrl,
  getToken,
  lesson,
}: ResourceAdapterHostProps): Promise<ResourceAdapterCapabilitiesResponse> {
  return callApi("Resource Adapter could not load capabilities.", async () => {
    const response = await createResourceAdapterClient({
      apiBaseUrl,
      getToken,
    }).capabilities.get.query(lesson);
    const parsedResponse =
      resourceAdapterCapabilitiesResponseSchema.safeParse(response);

    if (!parsedResponse.success) {
      throw new ResourceAdapterApiError(
        "Resource Adapter returned an invalid capabilities response.",
      );
    }

    return getSupportedCapabilities(parsedResponse.data);
  });
}
