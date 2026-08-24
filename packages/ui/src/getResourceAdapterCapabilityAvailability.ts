import { TRPCClientError } from "@trpc/client";
import { resourceAdapterCapabilityAvailabilityResponseSchema } from "@oaknational/resource-adapter-contracts";

import type { LessonContext } from "./publicTypes.js";
import { supportedCapabilityIds } from "./capabilities.js";
import { createResourceAdapterClient } from "./client.js";
import { ResourceAdapterApiError } from "./errors.js";

export type ResourceAdapterCapabilityAvailabilityProps = Readonly<{
  apiBaseUrl: string;
  lesson: LessonContext;
}>;

/**
 * Sends this package's supported capability ids rather than trusting the
 * service's own count, so a capability released ahead of UI support cannot
 * produce a prompt leading to an empty dialog.
 */
export async function getResourceAdapterCapabilityAvailability({
  apiBaseUrl,
  lesson,
}: ResourceAdapterCapabilityAvailabilityProps): Promise<boolean> {
  try {
    const response = await createResourceAdapterClient({
      apiBaseUrl,
      getToken: () => Promise.resolve(null),
    }).capabilities.available.query({
      ...lesson,
      supportedCapabilityIds: [...supportedCapabilityIds],
    });
    const parsedResponse =
      resourceAdapterCapabilityAvailabilityResponseSchema.safeParse(response);

    if (!parsedResponse.success) {
      throw new ResourceAdapterApiError(
        "Resource Adapter returned an invalid capability availability response.",
      );
    }

    return parsedResponse.data.available;
  } catch (error) {
    if (error instanceof ResourceAdapterApiError) {
      throw error;
    }

    if (error instanceof TRPCClientError) {
      throw new ResourceAdapterApiError(
        "Resource Adapter could not load capability availability.",
        error.data?.httpStatus,
      );
    }

    throw new ResourceAdapterApiError(
      "Resource Adapter could not load capability availability.",
    );
  }
}
