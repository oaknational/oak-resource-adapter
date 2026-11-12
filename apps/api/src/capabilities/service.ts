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

import { lessonRefusal, type LessonRefusal } from "../lesson-rules";
import { readLessonFacts } from "../curriculum/read-lesson-facts";
import { firstRefusal, type RuleRefusal } from "../rules/rule";
import type { TeacherAccess } from "../teacher-access/access";
import {
  teacherAccessResolver,
  type TeacherAccessResolver,
} from "../teacher-access/resolver";
import { capabilityDefinitions } from "./registry";
import type { CapabilityDefinition, EligibilityContext } from "./types";

export type EligibilityContextReader = (
  lesson: LessonContext,
) => Promise<EligibilityContext>;

const log = raLogger("capabilities");

export type CapabilityRefusal = RuleRefusal<
  "capability",
  CapabilityDefinition["rules"][number]
>;

export type EligibilityExplanation = Readonly<{
  lesson: LessonRefusal | null;
  /** Empty when the lesson is refused: capability rules are not checked. */
  capabilities: readonly Readonly<{ id: string; refusal: CapabilityRefusal | null }>[];
}>;

export function explainEligibility(
  definitions: ReadonlyArray<CapabilityDefinition>,
  context: EligibilityContext,
  teacher: Pick<TeacherAccess, "inCopyrightRegion"> | undefined,
): EligibilityExplanation {
  const lesson = lessonRefusal({ ...context, teacher });
  return {
    lesson,
    capabilities:
      lesson === null
        ? definitions.map(({ id, rules }) => ({
            id,
            refusal: firstRefusal("capability", rules, context),
          }))
        : [],
  };
}

export function evaluateCapabilities(
  definitions: ReadonlyArray<CapabilityDefinition>,
  context: EligibilityContext,
  teacher: Pick<TeacherAccess, "inCopyrightRegion"> | undefined,
): Pick<ResourceAdapterCapabilitiesResponse, "capabilities"> {
  const { lessonSlug, programmeSlug } = context.lesson;
  const explanation = explainEligibility(definitions, context, teacher);
  if (explanation.lesson !== null) {
    log.info(
      { lessonSlug, programmeSlug, refusal: explanation.lesson },
      "lesson refused",
    );
    return { capabilities: [] };
  }
  const offered = new Set<string>();
  for (const { id, refusal } of explanation.capabilities) {
    if (refusal === null) {
      offered.add(id);
    } else {
      log.info(
        { lessonSlug, programmeSlug, capabilityId: id, refusal },
        "capability refused",
      );
    }
  }
  return {
    capabilities: definitions
      .filter(({ id }) => offered.has(id))
      .map(({ id, label, resourceType }) => ({ id, label, resourceType })),
  };
}

/** `originalFileResourceTypes` is caller-supplied, not resolved from Oak. */
export const readEligibilityContext: EligibilityContextReader = async (lesson) => ({
  lesson,
  facts: await readLessonFacts(lesson),
  originalFileResourceTypes: lesson.availableResources,
  extractedResourceTypes: await originalResourceDocuments.listExtractedResourceTypes({
    source: "oak",
    lessonSlug: lesson.lessonSlug,
    programmeSlug: lesson.programmeSlug,
  }),
});

export type LessonOffer =
  | Readonly<{ outcome: "needsSetup" }>
  | Readonly<{
      outcome: "ready";
      teacher: TeacherAccess;
      capabilities: readonly ResourceAdapterCapability[];
    }>;

/** The rules every signed-in lesson entry point applies. */
export async function resolveLessonOffer(
  lesson: LessonContext,
  teacherId: string,
  readContext: EligibilityContextReader = readEligibilityContext,
  access: Pick<TeacherAccessResolver, "resolve"> = teacherAccessResolver,
): Promise<LessonOffer> {
  const teacher = await access.resolve(teacherId);
  if (!teacher.onboarded) {
    return { outcome: "needsSetup" };
  }
  const context = await readContext(lesson);
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
  readContext: EligibilityContextReader = readEligibilityContext,
  access: Pick<TeacherAccessResolver, "resolve"> = teacherAccessResolver,
): Promise<ResourceAdapterCapabilitiesResponse> {
  const offer = await resolveLessonOffer(lesson, target.teacherId, readContext, access);
  if (offer.outcome === "needsSetup") {
    return { account: { state: "needsSetup" }, capabilities: [] };
  }
  const { teacher, capabilities } = offer;
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
  readContext: EligibilityContextReader = readEligibilityContext,
): Promise<ResourceAdapterCapabilityAvailabilityResponse> {
  const { capabilities } = evaluateCapabilities(
    Object.values(capabilityDefinitions),
    await readContext(lesson),
    undefined,
  );
  const renderable = supportedCapabilityIds
    ? capabilities.filter(({ id }) => supportedCapabilityIds.includes(id))
    : capabilities;

  return { available: renderable.length > 0 };
}
