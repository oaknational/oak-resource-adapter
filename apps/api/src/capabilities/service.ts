import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";

import type {
  LessonContext,
  ResourceAdapterCapabilitiesResponse,
} from "@oaknational/resource-adapter-contracts";

import { capabilityDefinitions } from "./registry";
import type { CapabilityDefinition, EligibilityContext } from "./types";

export type EligibilityResolver = (
  lesson: LessonContext,
) => Promise<EligibilityContext>;

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

/** `originalFileResourceTypes` is caller-supplied, not resolved from Oak. */
export const resolveEligibility: EligibilityResolver = async (lesson) => ({
  lesson,
  originalFileResourceTypes: lesson.availableResources,
  extractedResourceTypes: await originalResourceDocuments.listExtractedResourceTypes({
    source: "oak",
    lessonSlug: lesson.lessonSlug,
    programmeSlug: lesson.programmeSlug,
  }),
});

export async function getCapabilities(
  lesson: LessonContext,
  resolveContext: EligibilityResolver = resolveEligibility,
): Promise<ResourceAdapterCapabilitiesResponse> {
  return evaluateCapabilities(
    Object.values(capabilityDefinitions),
    await resolveContext(lesson),
  );
}
