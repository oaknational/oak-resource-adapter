import { resourceAdapterCapabilityAvailabilityResponseSchema } from "@oaknational/resource-adapter-contracts";

import type { LessonContext } from "./publicTypes.js";
import { supportedCapabilityIds } from "./capabilities.js";
import { callApi, createResourceAdapterClient } from "./client.js";
import { ResourceAdapterApiError } from "./errors.js";
import {
  getSupportedTeachingMaterialIds,
  type ResourceAdapterTeachingMaterialId,
} from "./teachingMaterials.js";

export type ResourceAdapterCapabilityAvailability = Readonly<{
  available: boolean;
  teachingMaterials: readonly ResourceAdapterTeachingMaterialId[];
}>;

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
}: ResourceAdapterCapabilityAvailabilityProps): Promise<ResourceAdapterCapabilityAvailability> {
  return callApi(
    "Resource Adapter could not load capability availability.",
    async () => {
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

      return {
        available: parsedResponse.data.available,
        teachingMaterials: getSupportedTeachingMaterialIds(
          parsedResponse.data.teachingMaterials,
        ),
      };
    },
  );
}
