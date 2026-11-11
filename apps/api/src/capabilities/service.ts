import {
  createOakLessonEligibilityFactsReader,
  oakCurriculumConfigFromEnv,
} from "@oaknational/resource-adapter-curriculum";
import { raLogger } from "@oaknational/resource-adapter-logger";
import { originalResourceDocuments } from "@oaknational/resource-adapter-original-resource-documents";

import type {
  LessonContext,
  ResourceAdapterCapabilitiesResponse,
  ResourceAdapterCapability,
  ResourceAdapterCapabilityAvailabilityRequest,
  ResourceAdapterCapabilityAvailabilityResponse,
} from "@oaknational/resource-adapter-contracts";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import { lessonRefusal } from "../lesson-rules";
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

const log = raLogger("capabilities");

/** The lesson rules run before any capability's own predicate, which cannot override them. */
export function evaluateCapabilities(
  definitions: ReadonlyArray<CapabilityDefinition>,
  context: EligibilityContext,
  teacher: Pick<TeacherAccess, "inCopyrightRegion"> | undefined,
): Pick<ResourceAdapterCapabilitiesResponse, "capabilities"> {
  const refusal = lessonRefusal(context.facts, teacher);
  if (refusal !== null) {
    const { lessonSlug, programmeSlug } = context.lesson;
    log.info({ lessonSlug, programmeSlug, refusal }, "lesson refused");
    return { capabilities: [] };
  }
  return {
    capabilities: definitions
      .filter((definition) => definition.isEligible(context))
      .map(({ id, label, resourceType }) => ({ id, label, resourceType })),
  };
}

/** `originalFileResourceTypes` is caller-supplied, not resolved from Oak. */
export const resolveEligibility: EligibilityResolver = async (lesson) => ({
  lesson,
  facts: await createOakLessonEligibilityFactsReader(
    oakCurriculumConfigFromEnv(process.env),
  )(lesson),
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
    capabilities: evaluateCapabilities(
      Object.values(capabilityDefinitions),
      context,
      teacher,
    ).capabilities,
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

export async function hasCapabilities(
  { supportedCapabilityIds, ...lesson }: ResourceAdapterCapabilityAvailabilityRequest,
  resolveContext: EligibilityResolver = resolveEligibility,
): Promise<ResourceAdapterCapabilityAvailabilityResponse> {
  const { capabilities } = evaluateCapabilities(
    Object.values(capabilityDefinitions),
    await resolveContext(lesson),
    undefined,
  );
  const renderable = supportedCapabilityIds
    ? capabilities.filter(({ id }) => supportedCapabilityIds.includes(id))
    : capabilities;

  return { available: renderable.length > 0 };
}
