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
  ResourceAdapterCapability,
  ResourceAdapterCapabilityAvailabilityRequest,
  ResourceAdapterCapabilityAvailabilityResponse,
} from "@oaknational/resource-adapter-contracts";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import type { TeacherAccess } from "../teacher-access/access";
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

function meetsGeoRestriction(
  rights: Pick<LessonRights, "geoRestricted"> | null,
  teacher: Pick<TeacherAccess, "inCopyrightRegion">,
): boolean {
  return rights?.geoRestricted !== true || teacher.inCopyrightRegion;
}

export function evaluateCapabilities(
  definitions: ReadonlyArray<CapabilityDefinition>,
  context: EligibilityContext,
): Pick<ResourceAdapterCapabilitiesResponse, "capabilities"> {
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

export type LessonEligibility =
  | Readonly<{ outcome: "needsSetup" }>
  | Readonly<{
      outcome: "ready";
      teacher: TeacherAccess;
      capabilities: readonly ResourceAdapterCapability[];
    }>;

/** The rules every signed-in lesson entry point applies. */
export async function resolveLessonEligibility(
  lesson: LessonContext,
  teacherId: string,
  resolveContext: EligibilityResolver = resolveEligibility,
  access: Pick<TeacherAccessResolver, "resolve"> = teacherAccessResolver,
): Promise<LessonEligibility> {
  const teacher = await access.resolve(teacherId);
  if (!teacher.onboarded) {
    return { outcome: "needsSetup" };
  }
  const context = await resolveContext(lesson);
  return {
    outcome: "ready",
    teacher,
    capabilities: meetsGeoRestriction(context.rights, teacher)
      ? evaluateCapabilities(Object.values(capabilityDefinitions), context).capabilities
      : [],
  };
}

export async function getCapabilities(
  lesson: LessonContext,
  target: ResourceAdapterAuthenticatedTeacher,
  resolveContext: EligibilityResolver = resolveEligibility,
  access: Pick<TeacherAccessResolver, "resolve"> = teacherAccessResolver,
): Promise<ResourceAdapterCapabilitiesResponse> {
  const eligibility = await resolveLessonEligibility(
    lesson,
    target.teacherId,
    resolveContext,
    access,
  );
  if (eligibility.outcome === "needsSetup") {
    return { account: { state: "needsSetup" }, capabilities: [] };
  }
  const { teacher, capabilities } = eligibility;
  return {
    account: {
      state: "ready",
      tier: teacher.tier,
      inCopyrightRegion: teacher.inCopyrightRegion,
    },
    capabilities,
  };
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
