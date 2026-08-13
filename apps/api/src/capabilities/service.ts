import type {
  LessonContext,
  ResourceAdapterCapabilitiesResponse,
} from "@oaknational/resource-adapter-contracts";

import { capabilityDefinitions } from "./registry";
import type { CapabilityDefinition, EligibilityContext } from "./types";

export function evaluateCapabilities(
  definitions: ReadonlyArray<CapabilityDefinition>,
  context: EligibilityContext,
): ResourceAdapterCapabilitiesResponse {
  return {
    capabilities: definitions
      .filter((definition) => definition.isEligible(context))
      .map(({ id, label, resourceType }) => ({ id, label, resourceType })),
  };
}

export function getCapabilities(
  lesson: LessonContext,
): ResourceAdapterCapabilitiesResponse {
  return evaluateCapabilities(Object.values(capabilityDefinitions), { lesson });
}
