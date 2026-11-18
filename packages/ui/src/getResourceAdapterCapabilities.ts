import { resourceAdapterCapabilitiesResponseSchema } from "@oaknational/resource-adapter-contracts";

import type {
  ResourceAdapterCapabilitiesResponse,
  ResourceAdapterHostProps,
} from "./publicTypes.js";
import { getSupportedCapabilities, supportedCapabilityIds } from "./capabilities.js";
import { callApi, createResourceAdapterClient, readWithRetry } from "./client.js";
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
    const client = createResourceAdapterClient({ apiBaseUrl, getToken });
    const response = await readWithRetry((signal) =>
      client.capabilities.get.query(
        { ...lesson, supportedCapabilityIds: [...supportedCapabilityIds] },
        { signal },
      ),
    );
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
