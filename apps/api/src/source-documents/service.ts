import type { OriginalResourceDocumentLocator } from "@oaknational/resource-adapter-original-resource-documents";
import type { LessonContext } from "@oaknational/resource-adapter-contracts";
import type { ResourceAdapterAuthenticatedTeacher } from "@oaknational/resource-adapter-contracts/server";

import {
  isCapabilityEligible,
  meetsGeoRestriction,
  resolveEligibility,
  type EligibilityResolver,
} from "../capabilities/service";
import { capabilityDefinitions } from "../capabilities/registry";
import type { CapabilityDefinition } from "../capabilities/types";
import {
  teacherAccessResolver,
  type TeacherAccessResolver,
} from "../teacher-access/resolver";

/** Returns null when the capability is unavailable to this teacher. */
export async function resolveSourceDocumentLocator(
  { capabilityId, lesson }: Readonly<{ capabilityId: string; lesson: LessonContext }>,
  target: ResourceAdapterAuthenticatedTeacher,
  resolveContext: EligibilityResolver = resolveEligibility,
  access: Pick<TeacherAccessResolver, "resolve"> = teacherAccessResolver,
): Promise<OriginalResourceDocumentLocator | null> {
  if (!Object.hasOwn(capabilityDefinitions, capabilityId)) {
    return null;
  }
  const definition: CapabilityDefinition =
    capabilityDefinitions[capabilityId as keyof typeof capabilityDefinitions];

  const context = await resolveContext(lesson);
  if (
    !isCapabilityEligible(definition, context) ||
    !(await meetsGeoRestriction(context.rights, target.teacherId, access))
  ) {
    return null;
  }

  return {
    source: "oak",
    lessonSlug: lesson.lessonSlug,
    programmeSlug: lesson.programmeSlug,
    resourceType: definition.resourceType,
  };
}
