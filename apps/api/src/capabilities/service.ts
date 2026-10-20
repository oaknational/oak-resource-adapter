import {
  createOakLessonRightsReader,
  hasAdaptableRights,
  oakCurriculumConfigFromEnv,
  type LessonRights,
} from "@oaknational/resource-adapter-curriculum";
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";

import type {
  LessonContext,
  ResourceAdapterCapabilitiesResponse,
  ResourceAdapterCapabilityAvailabilityRequest,
  ResourceAdapterCapabilityAvailabilityResponse,
} from "@oaknational/resource-adapter-contracts";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import {
  teacherAccessResolver,
  type TeacherAccessResolver,
} from "../teacher-access/resolver";
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
  return (
    context.rights !== null &&
    hasAdaptableRights(context.rights) &&
    definition.isEligible(context)
  );
}

export async function meetsGeoRestriction(
  rights: Pick<LessonRights, "geoRestricted"> | null,
  teacherId: string,
  access: Pick<TeacherAccessResolver, "resolve"> = teacherAccessResolver,
): Promise<boolean> {
  return (
    rights?.geoRestricted !== true ||
    (await access.resolve(teacherId)).inCopyrightRegion
  );
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
  rights: await createOakLessonRightsReader(oakCurriculumConfigFromEnv(process.env))(
    lesson,
  ),
  originalFileResourceTypes: lesson.availableResources,
  extractedResourceTypes: await originalResourceDocuments.listExtractedResourceTypes({
    source: "oak",
    lessonSlug: lesson.lessonSlug,
    programmeSlug: lesson.programmeSlug,
  }),
});

export async function getCapabilities(
  lesson: LessonContext,
  target: ResourceAdapterAuthenticatedTeacher,
  resolveContext: EligibilityResolver = resolveEligibility,
  access: Pick<TeacherAccessResolver, "resolve"> = teacherAccessResolver,
): Promise<ResourceAdapterCapabilitiesResponse> {
  const context = await resolveContext(lesson);
  const response = evaluateCapabilities(Object.values(capabilityDefinitions), context);
  if (
    response.capabilities.length > 0 &&
    !(await meetsGeoRestriction(context.rights, target.teacherId, access))
  ) {
    return { capabilities: [] };
  }
  return response;
}

/** Signed out, so a geo-restricted lesson counts: signing in may unlock it. */
export async function hasCapabilities(
  { supportedCapabilityIds, ...lesson }: ResourceAdapterCapabilityAvailabilityRequest,
  resolveContext: EligibilityResolver = resolveEligibility,
): Promise<ResourceAdapterCapabilityAvailabilityResponse> {
  const { capabilities } = evaluateCapabilities(
    Object.values(capabilityDefinitions),
    await resolveContext(lesson),
  );
  const renderable = supportedCapabilityIds
    ? capabilities.filter(({ id }) => supportedCapabilityIds.includes(id))
    : capabilities;

  return { available: renderable.length > 0 };
}
