import type {
  LessonContext,
  ResourceAdapterCapabilitiesResponse,
} from "@oaknational/resource-adapter-contracts";

const capabilitiesResponse: ResourceAdapterCapabilitiesResponse = {
  capabilities: [
    {
      id: "worksheetAdapter",
      label: "Adapt worksheet",
      resourceType: "worksheet",
    },
  ],
};

/**
 * Service-owned eligibility will replace this initial implementation. Keeping
 * it outside the router makes the same logic usable by workers and direct
 * service tests.
 */
export function getCapabilities(
  lesson: LessonContext,
): ResourceAdapterCapabilitiesResponse {
  if (!lesson.availableResources.includes("worksheet")) {
    return { capabilities: [] };
  }

  return capabilitiesResponse;
}
