import type {
  LessonContext,
  ResourceAdapterCapabilitiesResponse,
} from "@oaknational/resource-adapter-contracts";
import type {
  FeatureFlagServiceType,
  ResourceAdapterAuthenticatedTeacher,
  ResourceAdapterCapabilitiesService,
} from "@oaknational/resource-adapter-contracts/server";
import type { FeatureFlagKey } from "./feature-flags/catalogue";

const capabilitiesResponse: ResourceAdapterCapabilitiesResponse = {
  capabilities: [
    {
      id: "worksheetAdapter",
      label: "Adapt worksheet",
      resourceType: "worksheet",
    },
  ],
};

export const smokeTestLabelSuffix = " (feature flag smoke test)";

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

async function applySmokeTestLabels(
  response: ResourceAdapterCapabilitiesResponse,
): Promise<ResourceAdapterCapabilitiesResponse> {
  return {
    capabilities: response.capabilities.map((capability) => ({
      ...capability,
      label: `${capability.label}${smokeTestLabelSuffix}`,
    })),
  };
}

export function buildCapabilitiesService(
  featureFlags: FeatureFlagServiceType<FeatureFlagKey>,
  authenticatedTeacher: ResourceAdapterAuthenticatedTeacher | null,
  getBaseCapabilities: (
    lesson: LessonContext,
  ) => ResourceAdapterCapabilitiesResponse = getCapabilities,
): ResourceAdapterCapabilitiesService {
  if (authenticatedTeacher === null) {
    return {
      getCapabilities: () => ({ capabilities: [] }),
    };
  }

  return {
    async getCapabilities(lesson: LessonContext) {
      const capabilities = getBaseCapabilities(lesson);

      if (capabilities.capabilities.length === 0) {
        return capabilities;
      }

      const isSmokeTestEnabled = await featureFlags.isEnabled(
        "capabilities-smoke-test",
        authenticatedTeacher,
      );
      return isSmokeTestEnabled ? applySmokeTestLabels(capabilities) : capabilities;
    },
  };
}
