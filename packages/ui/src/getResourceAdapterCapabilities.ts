import {
  resourceAdapterCapabilitiesResponseSchema,
  resourceAdapterContractVersion,
} from "@oaknational/resource-adapter-contracts";

import type {
  ResourceAdapterCapabilitiesResponse,
  ResourceAdapterHostProps,
} from "./publicTypes.js";

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
  apiBaseUrl,
  getToken,
  lesson,
}: ResourceAdapterHostProps): Promise<ResourceAdapterCapabilitiesResponse> {
  const token = await getToken();
  const response = await fetch(new URL("/v1/capabilities", apiBaseUrl), {
    body: JSON.stringify({
      contractVersion: resourceAdapterContractVersion,
      lesson,
    }),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new ResourceAdapterApiError(
      "Resource Adapter could not load capabilities.",
      response.status,
    );
  }

  const body: unknown = await response.json().catch(() => undefined);
  const parsedResponse = resourceAdapterCapabilitiesResponseSchema.safeParse(body);

  if (!parsedResponse.success) {
    throw new ResourceAdapterApiError(
      "Resource Adapter returned an invalid capabilities response.",
    );
  }

  return parsedResponse.data;
}
