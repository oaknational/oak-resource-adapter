import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";

import type {
  LessonContext,
  ResourceAdapterCapabilitiesResponse,
  ResourceAdapterCapabilityAvailabilityRequest,
  ResourceAdapterCapabilityAvailabilityResponse,
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

/** Shares `getCapabilities`' evaluation so the two answers cannot disagree. */
export async function hasCapabilities(
  { supportedCapabilityIds, ...lesson }: ResourceAdapterCapabilityAvailabilityRequest,
  resolveContext: EligibilityResolver = resolveEligibility,
): Promise<ResourceAdapterCapabilityAvailabilityResponse> {
  const { capabilities } = await getCapabilities(lesson, resolveContext);
  const renderable = supportedCapabilityIds
    ? capabilities.filter(({ id }) => supportedCapabilityIds.includes(id))
    : capabilities;

  return { available: renderable.length > 0 };
}
