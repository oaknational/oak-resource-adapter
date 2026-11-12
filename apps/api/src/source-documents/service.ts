import type { OriginalResourceDocumentLocator } from "@oaknational/resource-adapter-original-resource-documents";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import {
  resolveEligibility,
  resolveLessonEligibility,
  type EligibilityResolver,
} from "../capabilities/service";
import { capabilityDefinitions } from "../capabilities/registry";
import {
  teacherAccessResolver,
  type TeacherAccessResolver,
} from "../teacher-access/resolver";

export type SourceDocumentLocation =
  | Readonly<{ outcome: "needsSetup" }>
  | Readonly<{ outcome: "unavailable" }>
  | Readonly<{ outcome: "located"; locator: OriginalResourceDocumentLocator }>;

export async function resolveSourceDocumentLocator(
  { capabilityId, lesson }: Readonly<{ capabilityId: string; lesson: LessonContext }>,
  target: ResourceAdapterAuthenticatedTeacher,
  resolveContext: EligibilityResolver = resolveEligibility,
  access: Pick<TeacherAccessResolver, "resolve"> = teacherAccessResolver,
): Promise<SourceDocumentLocation> {
  if (!Object.hasOwn(capabilityDefinitions, capabilityId)) {
    return { outcome: "unavailable" };
  }

  const eligibility = await resolveLessonEligibility(
    lesson,
    target.teacherId,
    resolveContext,
    access,
  );
  if (eligibility.outcome === "needsSetup") {
    return eligibility;
  }
  const capability = eligibility.capabilities.find(({ id }) => id === capabilityId);
  if (capability === undefined) {
    return { outcome: "unavailable" };
  }

  return {
    outcome: "located",
    locator: {
      source: "oak",
      lessonSlug: lesson.lessonSlug,
      programmeSlug: lesson.programmeSlug,
      resourceType: capability.resourceType,
    },
  };
}
