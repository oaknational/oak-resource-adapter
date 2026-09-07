import {
  createOakLessonRestrictionReader,
  hasAdaptableRights,
  oakCurriculumConfigFromEnv,
} from "@oaknational/resource-adapter-curriculum";
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

/** Capability-specific predicates cannot override the lesson's rights gate. */
export function isCapabilityEligible(
  definition: CapabilityDefinition,
  context: EligibilityContext,
): boolean {
  return hasAdaptableRights(context.maxRestrictions) && definition.isEligible(context);
}

export function evaluateCapabilities(
  definitions: ReadonlyArray<CapabilityDefinition>,
  context: EligibilityContext,
): ResourceAdapterCapabilitiesResponse {
  return {
    capabilities: definitions
      .filter((definition) => isCapabilityEligible(definition, context))
      .map(({ id, label, resourceType }) => ({ id, label, resourceType })),
  };
}

/** `originalFileResourceTypes` is caller-supplied, not resolved from Oak. */
export const resolveEligibility: EligibilityResolver = async (lesson) => ({
  lesson,
  maxRestrictions: await createOakLessonRestrictionReader(
    oakCurriculumConfigFromEnv(process.env),
  )(lesson),
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
